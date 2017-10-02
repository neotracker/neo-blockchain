/* @flow */
import type Client from '../Client';
import type { Hash160Like } from '../types';
import { type SmartContractABI } from './SmartContractABI';
import SmartContractInstance from './SmartContractInstance';

import converters from '../converters';

type SmartContractOptions = {|
  abi: SmartContractABI,
  client: Client,
|};
export default class SmartContract {
  _abi: SmartContractABI;
  _client: Client;

  constructor({
    abi,
    client,
  }: SmartContractOptions) {
    this._abi = abi;
    this._client = client;
  }

  at(contractScriptHash: Hash160Like): SmartContractInstance {
    return new SmartContractInstance({
      abi: this._abi,
      contractScriptHash: converters.hash160(this._client, contractScriptHash),
      client: this._client,
    })
  }
}
