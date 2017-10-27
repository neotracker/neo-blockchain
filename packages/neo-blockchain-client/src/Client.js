/* @flow */
import {
  type PrivateKey,
  type Transaction,
  type UInt160,
  ClaimTransaction,
  ContractTransaction,
  Input,
  JSONHelper,
  Output,
  common,
  crypto,
} from 'neo-blockchain-core';

import {
  type Account,
  type AddressLike,
  type Action,
  type Asset,
  type Block,
  type Hash160Like,
  type Hash256Like,
  type InputArg,
  type InvocationResult,
  type OutputArg,
  type PrivateKeyLike,
  type StorageItem,
  type TransactionOptions,
} from './types';
import AsyncBlockIterator from './AsyncBlockIterator';
import { type BlockFilter, type GetActionsFilter } from './filter';
import { type SmartContractABI, SmartContract } from './sc';

import abi from './abi';
import converters from './converters';
import { parameters } from './utils';

type ClientOptions = {|
  addressVersion?: number,
  privateKeyVersion?: number,
|};

export default class Client {
  _addressVersion: number;
  _privateKeyVersion: number;

  constructor(optionsIn?: ClientOptions) {
    const options = optionsIn || {};
    this._addressVersion =
      options.addressVersion == null
        ? common.NEO_ADDRESS_VERSION
        : options.addressVersion;
    this._privateKeyVersion =
      options.privateKeyVersion == null
        ? common.NEO_PRIVATE_KEY_VERSION
        : options.privateKeyVersion;
  }

  parameters = parameters;
  abi = abi;

  // eslint-disable-next-line
  getAccount(addressOrScriptHash: AddressLike): Promise<Account> {
    throw new Error('Not Implemented');
  }

  // eslint-disable-next-line
  getAsset(hash: Hash256Like): Promise<Asset> {
    throw new Error('Not Implemented');
  }

  // eslint-disable-next-line
  getBlock(hashOrIndex: Hash256Like | number): Promise<Block> {
    throw new Error('Not Implemented');
  }

  smartContract(abiIn: SmartContractABI): SmartContract {
    return new SmartContract({ abi: abiIn, client: this });
  }

  // eslint-disable-next-line
  getActions(filters: GetActionsFilter): Promise<Array<Action>> {
    throw new Error('Not Implemented');
  }

  getBestBlockHash(): Promise<string> {
    throw new Error('Not Implemented');
  }

  getBlockCount(): Promise<number> {
    throw new Error('Not Implemented');
  }

  iterBlocks(filter: BlockFilter): AsyncIterator<Block> {
    return new AsyncBlockIterator({ filter, client: this });
  }

  // eslint-disable-next-line
  sendRawTransaction(value: Buffer): Promise<void> {
    throw new Error('Not Implemented');
  }

  transferRaw(
    inputs: Array<InputArg>,
    outputs: Array<OutputArg>,
    { privateKey }: TransactionOptions,
  ): Promise<string> {
    return this._sendTransaction(
      // TODO: Not covered by Flow...
      new ContractTransaction(
        ({
          inputs: this._convertInputs(inputs),
          outputs: this._convertOutputs(outputs),
        }: $FlowFixMe),
      ),
      privateKey,
    );
  }

  claimRaw(
    claims: Array<InputArg>,
    outputs: Array<OutputArg>,
    { privateKey }: TransactionOptions,
  ): Promise<string> {
    return this._sendTransaction(
      // TODO: Not covered by Flow...
      new ClaimTransaction({
        claims: this._convertInputs(claims),
        outputs: this._convertOutputs(outputs),
      }),
      privateKey,
    );
  }

  // eslint-disable-next-line
  invokeScript(script: Buffer): Promise<InvocationResult> {
    throw new Error('Not Implemented');
  }

  // eslint-disable-next-line
  getAllStorage(hash: Hash160Like): Promise<Array<StorageItem>> {
    throw new Error('Not Implemented');
  }

  scriptHashToAddress(scriptHash: Hash160Like): string {
    return crypto.scriptHashToAddress({
      addressVersion: this._addressVersion,
      scriptHash: converters.hash160(this, scriptHash),
    });
  }

  addressToScriptHash(address: string): UInt160 {
    return crypto.addressToScriptHash({
      addressVersion: this._addressVersion,
      address,
    });
  }

  wifToPrivateKey(wif: string): PrivateKey {
    return crypto.wifToPrivateKey(wif, this._privateKeyVersion);
  }

  _convertInputs(inputs: Array<InputArg>): Array<Input> {
    // TODO: Not covered by Flow...
    return inputs.map(
      input =>
        new Input({
          hash: converters.hash256(this, input.txid),
          index: input.index,
        }),
    );
  }

  _convertOutputs(outputs: Array<OutputArg>): Array<Output> {
    // TODO: Not covered by Flow...
    return outputs.map(
      output =>
        new Output({
          address: converters.hash160(this, output.address),
          asset: converters.hash256(this, output.asset),
          value: common.fixed8FromDecimal(output.value),
        }),
    );
  }

  async _sendTransaction(
    transactionUnsigned: Transaction,
    privateKeyLike: PrivateKeyLike,
  ): Promise<string> {
    const transaction = transactionUnsigned.sign(
      converters.privateKey(this, privateKeyLike),
    );
    await this.sendRawTransaction(transaction.serializeWire());
    return JSONHelper.writeUInt256(transaction.hash);
  }
}
