/* @flow */
import WIF from 'wif';

import bs58 from 'bs58';
import crypto from 'crypto';
import { ec as EC } from 'elliptic';
import scrypt from 'scrypt-js';
import xor from 'buffer-xor';

import { InvalidFormatError } from '../errors';
import { ScriptBuilder } from '../utils';
import Witness from '../Witness';

import common, {
  type ECPoint,
  type PrivateKey,
  type UInt160,
  type UInt256,
} from '../common';

type KeyPair = any;

const ec = new EC('p256');

export class Base58CheckError extends Error {
  constructor() {
    super('Base58 Check Decode Error.');
  }
}

export class InvalidAddressError extends Error {
  address: string;

  constructor(address: string) {
    super(`Invalid Address: ${address}`);
    this.address = address;
  }
}

const sha1 = (value: Buffer): Buffer =>
  crypto
    .createHash('sha1')
    .update(value)
    .digest();

const sha256 = (value: Buffer): Buffer =>
  crypto
    .createHash('sha256')
    .update(value)
    .digest();

const rmd160 = (value: Buffer): Buffer =>
  crypto
    .createHash('rmd160')
    .update(value)
    .digest();

const hash160 = (value: Buffer): UInt160 =>
  common.bufferToUInt160(rmd160(sha256(value)));

const hash256 = (value: Buffer): UInt256 =>
  common.bufferToUInt256(sha256(sha256(value)));

// TODO: This + verify should probably handle DER format signatures as well
const sign = ({
  message,
  privateKey,
}: {|
  message: Buffer,
  privateKey: PrivateKey,
|}): Buffer => {
  const sig = ec.sign(sha256(message), common.privateKeyToBuffer(privateKey));
  return Buffer.concat([
    sig.r.toArrayLike(Buffer, 'be', 32),
    sig.s.toArrayLike(Buffer, 'be', 32),
  ]);
};

class InvalidSignatureError extends Error {
  constructor() {
    super('Invalid Signature');
  }
}

const verify = ({
  message,
  signature,
  publicKey,
}: {|
  message: Buffer,
  signature: Buffer,
  publicKey: Buffer,
|}) => {
  if (signature.length !== 64) {
    throw new InvalidSignatureError();
  }

  const r = signature.slice(0, 32);
  const s = signature.slice(32);
  return ec.verify(sha256(message), { r, s }, publicKey);
};

class InvalidPrivateKeyError extends Error {
  constructor() {
    super('Invalid Private Key');
  }
}

const toECPointFromKeyPair = (pair: KeyPair): ECPoint =>
  common.bufferToECPoint(Buffer.from(pair.getPublic(true, 'hex'), 'hex'));

const getPublicKey = (privateKey: PrivateKey): ECPoint => {
  const key = ec.keyFromPrivate(common.privateKeyToBuffer(privateKey));
  key.getPublic(true, 'hex');
  const { result } = key.validate();
  if (!result) {
    throw new InvalidPrivateKeyError();
  }

  return toECPointFromKeyPair(key);
};

const createKeyPair = (): { privateKey: PrivateKey, publicKey: ECPoint } => {
  const key = ec.genKeyPair();

  return {
    privateKey: common.bufferToPrivateKey(
      key.getPrivate().toArrayLike(Buffer, 'be'),
    ),
    publicKey: toECPointFromKeyPair(key),
  };
};

const createPrivateKey = (): PrivateKey =>
  common.bufferToPrivateKey(crypto.randomBytes(32));

const toScriptHash = (value: Buffer): UInt160 => hash160(value);

// Takes various formats and converts to standard ECPoint
const toECPoint = (publicKey: Buffer): ECPoint =>
  toECPointFromKeyPair(ec.keyFromPublic(publicKey));

const isInfinity = (ecPoint: ECPoint): boolean =>
  ec
    .keyFromPublic(ecPoint)
    .getPublic()
    .isInfinity();

const base58Checksum = (buffer: Buffer): Buffer =>
  common.uInt256ToBuffer(hash256(buffer)).slice(0, 4);

const base58CheckEncode = (buffer: Buffer): string => {
  const checksum = base58Checksum(buffer);
  return bs58.encode(Buffer.concat([buffer, checksum]));
};

const base58CheckDecode = (value: string): Buffer => {
  const buffer = bs58.decode(value);
  const payload = buffer.slice(0, -4);
  const checksum = buffer.slice(-4);
  const payloadChecksum = base58Checksum(payload);
  if (!checksum.equals(payloadChecksum)) {
    throw new Base58CheckError();
  }

  return payload;
};

const scriptHashToAddress = ({
  addressVersion,
  scriptHash,
}: {|
  addressVersion: number,
  scriptHash: UInt160,
|}): string => {
  const buffer = Buffer.allocUnsafe(21);
  buffer[0] = addressVersion;
  common.uInt160ToBuffer(scriptHash).copy(buffer, 1);
  return base58CheckEncode(buffer);
};

const addressToScriptHash = ({
  addressVersion,
  address,
}: {|
  addressVersion: number,
  address: string,
|}): UInt160 => {
  const decodedAddress = base58CheckDecode(address);
  if (decodedAddress.length !== 21 || decodedAddress[0] !== addressVersion) {
    throw new InvalidAddressError(address);
  }

  return common.bufferToUInt160(decodedAddress.slice(1));
};

const createInvocationScript = (
  message: Buffer,
  privateKey: PrivateKey,
): Buffer => {
  const builder = new ScriptBuilder();
  builder.emitPush(sign({ message, privateKey }));
  return builder.build();
};

const createVerificationScript = (publicKey: ECPoint): Buffer => {
  const builder = new ScriptBuilder();
  builder.emitPushECPoint(publicKey);
  builder.emitOp('CHECKSIG');
  return builder.build();
};

const createWitness = (message: Buffer, privateKey: PrivateKey): Witness => {
  const verification = createVerificationScript(getPublicKey(privateKey));
  const invocation = createInvocationScript(message, privateKey);
  return new Witness({ verification, invocation });
};

const getVerificationScriptHash = (publicKey: ECPoint): UInt160 =>
  toScriptHash(createVerificationScript(publicKey));

const compareKeys = (a: KeyPair, b: KeyPair): number => {
  const aPublic = a.getPublic();
  const bPublic = b.getPublic();
  const result = aPublic.getX().cmp(bPublic.getX());
  if (result !== 0) {
    return result;
  }

  return aPublic.getY().cmp(bPublic.getY());
};

const sortKeys = (publicKeys: Array<ECPoint>): Array<ECPoint> =>
  publicKeys
    .map(publicKey => ec.keyFromPublic(publicKey))
    .sort(compareKeys)
    .map(keyPair => toECPointFromKeyPair(keyPair));

const createMultiSignatureRedeemScript = (
  m: number,
  publicKeys: Array<ECPoint>,
) => {
  if (!(m >= 1 && m <= publicKeys.length && publicKeys.length <= 1024)) {
    // TODO: Better error
    throw new Error();
  }

  const builder = new ScriptBuilder();
  builder.emitPushInt(Math.floor(m));
  const publicKeysSorted = sortKeys(publicKeys);
  for (const ecPoint of publicKeysSorted) {
    builder.emitPushECPoint(ecPoint);
  }
  builder.emitPushInt(publicKeysSorted.length);
  builder.emitOp('CHECKMULTISIG');
  return builder.build();
};

const getConsensusAddress = (validators: Array<ECPoint>): UInt160 =>
  toScriptHash(
    createMultiSignatureRedeemScript(
      validators.length - (validators.length - 1) / 3,
      validators,
    ),
  );

const wifToPrivateKey = (
  wif: string,
  privateKeyVersion: number,
): PrivateKey => {
  const privateKeyDecoded = base58CheckDecode(wif);

  if (
    privateKeyDecoded.length !== 34 ||
    privateKeyDecoded[0] !== privateKeyVersion ||
    privateKeyDecoded[33] !== 0x01
  ) {
    throw new InvalidFormatError();
  }

  return common.bufferToPrivateKey(privateKeyDecoded.slice(1, 33));
};

const privateKeyToWif = (
  privateKey: PrivateKey,
  privateKeyVersion: number,
): string =>
  WIF.encode(privateKeyVersion, common.privateKeyToBuffer(privateKey), true);

const privateKeyToScriptHash = (privateKey: PrivateKey): UInt160 =>
  getVerificationScriptHash(getPublicKey(privateKey));

const privateKeyToAddress = ({
  addressVersion,
  privateKey,
}: {|
  addressVersion: number,
  privateKey: PrivateKey,
|}): string =>
  scriptHashToAddress({
    addressVersion,
    scriptHash: privateKeyToScriptHash(privateKey),
  });

const NEP2_KDFPARAMS = {
  N: 16384,
  r: 8,
  p: 8,
  dklen: 64,
};

const NEP2_ZERO = 0x01;
const NEP2_ONE = 0x42;
const NEP2_TWO = 0xe0;
const NEP2_CIPHER = 'aes-256-ecb';

const getNEP2Derived = ({
  password,
  salt,
}: {|
  password: string,
  salt: Buffer,
|}): Promise<Buffer> =>
  new Promise((resolve, reject) =>
    scrypt(
      Buffer.from(password, 'utf8'),
      salt,
      NEP2_KDFPARAMS.N,
      NEP2_KDFPARAMS.r,
      NEP2_KDFPARAMS.p,
      NEP2_KDFPARAMS.dklen,
      (error, progress, key) => {
        if (error != null) {
          reject(error);
        } else if (key) {
          resolve(Buffer.from(key));
        }
      },
    ),
  );

const getNEP2Salt = ({
  addressVersion,
  privateKey,
}: {|
  addressVersion: number,
  privateKey: PrivateKey,
|}) => {
  const address = privateKeyToAddress({
    addressVersion,
    privateKey,
  });
  return common
    .uInt256ToBuffer(hash256(Buffer.from(address, 'latin1')))
    .slice(0, 4);
};

const encryptNEP2 = async ({
  addressVersion,
  password,
  privateKey,
}: {|
  addressVersion: number,
  password: string,
  privateKey: PrivateKey,
|}): Promise<string> => {
  const salt = getNEP2Salt({ addressVersion, privateKey });

  const derived = await getNEP2Derived({ password, salt });
  const derived1 = derived.slice(0, 32);
  const derived2 = derived.slice(32, 64);

  const cipher = crypto.createCipheriv(
    NEP2_CIPHER,
    derived2,
    Buffer.alloc(0, 0),
  );
  cipher.setAutoPadding(false);
  cipher.end(xor(privateKey, derived1));
  const ciphertext = (cipher.final(): $FlowFixMe);

  const result = Buffer.alloc(7 + 32, 0);
  result.writeUInt8(0x01, NEP2_ZERO);
  result.writeUInt8(0x42, NEP2_ONE);
  result.writeUInt8(0xe0, NEP2_TWO);
  salt.copy(result, 3);
  ciphertext.copy(result, 7);

  return base58CheckEncode(result);
};

const decryptNEP2 = async ({
  addressVersion,
  encryptedKey,
  password,
}: {|
  addressVersion: number,
  encryptedKey: string,
  password: string,
|}): Promise<PrivateKey> => {
  const decoded = base58CheckDecode(encryptedKey);

  if (
    decoded.length !== 39 ||
    decoded.readUInt8(0) !== NEP2_ZERO ||
    decoded.readUInt8(1) !== NEP2_ONE ||
    decoded.readUInt8(2) !== NEP2_TWO
  ) {
    throw new Error('Invalid NEP2 format.');
  }

  const salt = decoded.slice(3, 7);
  const derived = await getNEP2Derived({ password, salt });
  const derived1 = derived.slice(0, 32);
  const derived2 = derived.slice(32, 64);

  const decipher = crypto.createDecipheriv(
    NEP2_CIPHER,
    derived2,
    Buffer.alloc(0, 0),
  );
  decipher.setAutoPadding(false);
  decipher.end(decoded.slice(7, 7 + 32));
  const plainText = decipher.final();

  const privateKey = xor(plainText, derived1);

  const addressSalt = getNEP2Salt({ addressVersion, privateKey });
  if (!salt.equals(addressSalt)) {
    throw new Error('Wrong passphrase.');
  }

  return common.bufferToPrivateKey(privateKey);
};

export default {
  sha1,
  sha256,
  hash160,
  hash256,
  sign,
  verify,
  getPublicKey,
  toScriptHash,
  toECPoint,
  isInfinity,
  createKeyPair,
  scriptHashToAddress,
  addressToScriptHash,
  createInvocationScript,
  createVerificationScript,
  createWitness,
  getVerificationScriptHash,
  createMultiSignatureRedeemScript,
  getConsensusAddress,
  privateKeyToWif,
  wifToPrivateKey,
  privateKeyToScriptHash,
  privateKeyToAddress,
  encryptNEP2,
  decryptNEP2,
  createPrivateKey,
};
