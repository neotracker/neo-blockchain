/* @flow */
import CryptoJS, { type WordArray } from 'crypto-js';
import WIF from 'wif';

import bs58 from 'bs58';
import { ec as EC } from 'elliptic';

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
    super(`Invalid Address: ${address}`)
    this.address = address;
  }
}

const toBuffer = (wordArray: WordArray): Buffer =>
  Buffer.from(wordArray.toString(CryptoJS.enc.Hex), 'hex');

const toWordArray = (buffer: Buffer): WordArray =>
  CryptoJS.enc.Hex.parse(buffer.toString('hex'));

const sha1 = (value: Buffer): Buffer =>
  toBuffer(CryptoJS.SHA1(toWordArray(value)));

const sha256 = (value: Buffer): Buffer =>
  toBuffer(CryptoJS.SHA256(toWordArray(value)));

const hash160 = (value: Buffer): UInt160 => common.bufferToUInt160(
  toBuffer(CryptoJS.RIPEMD160(CryptoJS.SHA256(toWordArray(value))))
);

const hash256 = (value: Buffer): UInt256 => common.bufferToUInt256(
  toBuffer(CryptoJS.SHA256(CryptoJS.SHA256(toWordArray(value)))),
);

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

const toScriptHash = (value: Buffer): UInt160 => hash160(value);

// Takes various formats and converts to standard ECPoint
const toECPoint = (publicKey: Buffer): ECPoint => toECPointFromKeyPair(
  ec.keyFromPublic(publicKey),
);

const isInfinity = (ecPoint: ECPoint): boolean =>
  ec.keyFromPublic(ecPoint).getPublic().isInfinity();

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
  if (
    decodedAddress.length !== 21 ||
    decodedAddress[0] !== addressVersion
  ) {
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
}

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
}

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
}

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
    builder.emitPushECPoint(ecPoint)
  }
  builder.emitPushInt(publicKeysSorted.length);
  builder.emitOp('CHECKMULTISIG');
  return builder.build();
}

const getConsensusAddress = (validators: Array<ECPoint>): UInt160 =>
  toScriptHash(createMultiSignatureRedeemScript(
    validators.length - (validators.length - 1) / 3,
    validators,
  ));

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
  WIF.encode(
    privateKeyVersion,
    common.privateKeyToBuffer(privateKey),
    true,
  );

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
};
