/* @flow */
import BN from 'bn.js';
import BigNumber from 'bignumber.js';
import {
  ATTRIBUTE_USAGE,
  type UInt160,
  BufferAttribute,
  InvocationTransaction,
  JSONHelper,
  ScriptBuilder,
  UInt160Attribute,
  utils,
} from 'neo-blockchain-core';

import { of as asyncIterableOf } from 'ix/asynciterable/of';
import { flatMap } from 'ix/asynciterable/flatmap';

import type {
  Action,
  AddressLike,
  ContractParameter,
  Number,
  StorageItem,
  TransactionOptions,
} from '../types';
import type { ActionFilter } from '../filter';
import type Client from '../Client';
import { type SmartContractABI } from './SmartContractABI';

import converters from '../converters';

const TEN = new BigNumber('10');

type SmartContractInstanceOptions = {|
  abi: SmartContractABI,
  contractScriptHash: UInt160,
  client: Client,
|};

type Data = {|
  decimals: number,
  name: string,
  symbol: string,
  totalSupply: BigNumber,
|};

// TODO: Generate methods based on ABI, currently hard coded for NEP5
export default class SmartContractInstance {
  _abi: SmartContractABI;
  _contractScriptHash: UInt160;
  _client: Client;
  _data: ?Promise<Data>;

  constructor({
    abi,
    contractScriptHash,
    client,
  }: SmartContractInstanceOptions) {
    this._abi = abi;
    this._contractScriptHash = contractScriptHash;
    this._client = client;
    this._data = null;
  }

  iterActions(filterIn?: ActionFilter): AsyncIterator<Action> {
    const filter = filterIn || {};
    return flatMap(
      this._client.iterBlocks({
        indexStart: filter.blockIndexStart,
        indexStop: filter.blockIndexStop,
      }),
      async (block) => {
        const actions = await this._client.getActions({
          blockIndexStart: block.index,
          transactionIndexStart: block.index === filter.blockIndexStart
            ? filter.transactionIndexStart
            : undefined,
          indexStart: block.index === filter.blockIndexStart
            ? filter.indexStart
            : undefined,
          blockIndexStop: block.index,
          transactionIndexStop: block.index === filter.blockIndexStop
            ? filter.transactionIndexStop
            : undefined,
          indexStop: block.index === filter.blockIndexStop
            ? filter.indexStop
            : undefined,
          scriptHash: JSONHelper.writeUInt160(this._contractScriptHash),
        });
        return asyncIterableOf(...actions);
      },
    );
  }

  getAllStorage(): Promise<Array<StorageItem>> {
    return this._client.getAllStorage(this._contractScriptHash);
  }

  async transfer(
    fromAddressIn: AddressLike,
    toAddressIn: AddressLike,
    valueIn: Number,
    { privateKey }: TransactionOptions,
  ): Promise<string> {
    const fromAddress = converters.hash160(this._client, fromAddressIn);
    const toAddress = converters.hash160(this._client, toAddressIn);
    const value = converters.number(this._client, valueIn);
    const decimals =  await this.decimals();
    const sb = new ScriptBuilder();
    sb.emitAppCall(
      this._contractScriptHash,
      'transfer',
      fromAddress,
      toAddress,
      this._numberToInteger(value, decimals),
    );
    sb.emitOp('THROWIFNOT');

    // TODO: Why is this not covered by Flow?
    return this._client._sendTransaction(
      new InvocationTransaction({
        version: 1,
        attributes: [
          new UInt160Attribute({
            usage: ATTRIBUTE_USAGE.SCRIPT,
            value: fromAddress,
          }),
          new BufferAttribute({
            usage: ATTRIBUTE_USAGE.REMARK1,
            value: utils.toSignedBuffer(new BN(utils.randomUInt())),
          }),
        ],
        script: sb.build(),
        gas: utils.ZERO,
      }),
      privateKey,
    );
  }

  name(): Promise<string> {
    return this._getData().then(result => result.name);
  }

  symbol(): Promise<string> {
    return this._getData().then(result => result.symbol);
  }

  async decimals(): Promise<number> {
    return this._getData().then(result => result.decimals);
  }

  async totalSupply(): Promise<BigNumber> {
    return this._getData().then(result => result.totalSupply);
  }

  _integerToNumber(value: BigNumber, decimals: number): BigNumber {
    if (decimals > 0) {
      return value.div(TEN.pow(decimals));
    }

    return value;
  }

  _numberToInteger(valueIn: BigNumber, decimals: number): BN {
    let value = valueIn;
    if (decimals > 0) {
      value = valueIn.times(TEN.pow(decimals));
    }

    return new BN(value.toString(10), 10);
  }

  async _invokeScript(script: Buffer): Promise<Array<ContractParameter>> {
    const result = await this._client.invokeScript(script);
    if (result.type === 'Error') {
      throw new Error(result.message);
    }

    return result.stack;
  }

  _getData(): Promise<Data> {
    if (this._data == null) {
      const sb = new ScriptBuilder();
      sb.emitAppCall(this._contractScriptHash, 'name');
      sb.emitAppCall(this._contractScriptHash, 'symbol');
      sb.emitAppCall(this._contractScriptHash, 'decimals');
      sb.emitAppCall(this._contractScriptHash, 'totalSupply');
      this._data = this._invokeScript(sb.build())
        .then((result) => {
          const name = this._client.parameters.toString(result[3]);
          const symbol = this._client.parameters.toString(result[2]);
          const decimals =
            this._client.parameters.toInteger(result[1]).toNumber();
          const totalSupply = this._integerToNumber(
            this._client.parameters.toInteger(result[0]),
            decimals,
          );
          return {
            name,
            symbol,
            decimals,
            totalSupply,
          };
        })
        .catch((error) => {
          this._data = null;
          throw error;
        })
    }
    return this._data;
  }
}
