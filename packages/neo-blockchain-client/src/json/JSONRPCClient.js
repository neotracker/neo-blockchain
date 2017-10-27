/* @flow */
import { JSONHelper } from 'neo-blockchain-core';

import {
  type Account,
  type Action,
  type Asset,
  type Block,
  type Hash160Like,
  type Hash256Like,
  type InvocationResult,
  type StorageItem,
} from '../types';
import Client from '../Client';
import { type GetActionsFilter } from '../filter';
import { type JSONRPCProvider } from './JSONRPCProvider';
import { SendTransactionError } from '../errors';

import converters from '../converters';

type JSONRPCClientOptions = {|
  addressVersion: number,
  privateKeyVersion: number,
|};

export default class JSONRPCClient extends Client {
  _provider: JSONRPCProvider;
  _addressVersion: number;

  constructor(provider: JSONRPCProvider, optionsIn?: JSONRPCClientOptions) {
    const options = optionsIn || {};
    super({
      addressVersion: options.addressVersion,
      privateKeyVersion: options.privateKeyVersion,
    });
    this._provider = provider;
  }

  getAccount(addressOrScriptHash: Hash160Like): Promise<Account> {
    return this._provider.request({
      method: 'getaccountstate',
      params: [
        this.scriptHashToAddress(converters.hash160(this, addressOrScriptHash)),
      ],
    });
  }

  getAsset(hash: Hash256Like): Promise<Asset> {
    return this._provider.request({
      method: 'getassetstate',
      params: [JSONHelper.writeUInt256(converters.hash256(this, hash))],
    });
  }

  getBlock(hashOrIndex: Hash256Like | number): Promise<Block> {
    return this._provider.request({
      method: 'getblock',
      params: [
        typeof hashOrIndex === 'number'
          ? hashOrIndex
          : JSONHelper.writeUInt256(converters.hash256(this, hashOrIndex)),
        1,
      ],
    });
  }

  // eslint-disable-next-line
  getActions(filter: GetActionsFilter): Promise<Array<Action>> {
    return this._provider.request({
      method: 'getactions',
      params: [
        {
          ...filter,
          scriptHash:
            filter.scriptHash == null
              ? undefined
              : JSONHelper.writeUInt160(
                  converters.hash160(this, filter.scriptHash),
                ),
        },
      ],
    });
  }

  getBestBlockHash(): Promise<string> {
    return this._provider.request({ method: 'getbestblockhash' });
  }

  getBlockCount(): Promise<number> {
    return this._provider.request({ method: 'getblockcount' });
  }

  sendRawTransaction(value: Buffer): Promise<void> {
    return this._provider
      .request({
        method: 'sendrawtransaction',
        params: [JSONHelper.writeBuffer(value)],
      })
      .then(result => {
        if (!result) {
          throw new SendTransactionError();
        }
      });
  }

  invokeScript(script: Buffer): Promise<InvocationResult> {
    return this._provider.request({
      method: 'invokescriptv2',
      params: [JSONHelper.writeBuffer(script)],
    });
  }

  // eslint-disable-next-line
  getAllStorage(hash: Hash160Like): Promise<Array<StorageItem>> {
    return this._provider.request({
      method: 'getallstorage',
      params: [JSONHelper.writeUInt160(converters.hash160(this, hash))],
    });
  }
}
