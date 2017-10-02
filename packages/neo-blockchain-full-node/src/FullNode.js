/* @flow */
import Blockchain from 'neo-blockchain-impl';
import {
  type Blockchain as BlockchainType,
  type Endpoint,
  type Logger,
  type Storage,
} from 'neo-blockchain-node-core';
import {
  type Settings,
} from 'neo-blockchain-core';
import Node from 'neo-blockchain-node';
import { RPCServer, type RPCSettings } from 'neo-blockchain-rpc';

import leveldown from 'leveldown';
import levelup from 'levelup';
import levelUpStorage from 'neo-blockchain-levelup';
import { type Chain, dumpChain, loadChain } from 'neo-blockchain-offline';
// $FlowFixMe
import { performance } from 'perf_hooks'; // eslint-disable-line
import vm from 'neo-blockchain-vm';

export type FullNodeCreateOptions = {|
  seeds: Array<Endpoint>,
  settings: Settings,
  dataPath: string,
  logger: Logger,
  identifier: string,
  rpcEndpoints: Array<string>,
  rpcSettings?: RPCSettings,
  chain?: Chain,
|};

export type FullNodeOptions = {|
  blockchain: BlockchainType,
  node: Node,
  rpcServer: RPCServer,
  storage: Storage,
  chain?: Chain,
|};

export default class FullNode {
  _blockchain: BlockchainType;
  _node: Node;
  _rpcServer: RPCServer;
  _storage: Storage;
  _chain: ?Chain;

  constructor({
    blockchain,
    node,
    rpcServer,
    storage,
    chain,
  }: FullNodeOptions) {
    this._blockchain = blockchain;
    this._node = node;
    this._rpcServer = rpcServer;
    this._storage = storage;
    this._chain = chain;
  }

  static async create({
    settings,
    seeds,
    dataPath,
    logger,
    identifier,
    rpcEndpoints,
    rpcSettings,
    chain,
  }: FullNodeCreateOptions): Promise<FullNode> {
    const context = {
      messageMagic: settings.messageMagic,
    }
    const storage = levelUpStorage({
      db: levelup(leveldown(dataPath)),
      context,
    })
    const blockchain = await Blockchain.create({
      settings,
      storage,
      vm,
      logger,
      identifier,
    });
    const node = new Node({ blockchain, seeds });
    const rpcServer = new RPCServer({
      blockchain,
      node,
      rpcEndpoints,
      settings: rpcSettings,
    });
    return new FullNode({ blockchain, node, rpcServer, storage, chain });
  }

  async start(): Promise<void> {
    await this._rpcServer.start();
    if (this._chain != null) {
      await loadChain({
        blockchain: this._blockchain,
        chain: this._chain,
      });
    }
    this._node.start();
  }

  async stop(): Promise<void> {
    await this._rpcServer.stop();
    this._node.stop();
    await this._storage.close();
  }

  async dump(outPath: string): Promise<void> {
    await dumpChain({
      blockchain: this._blockchain,
      path: outPath,
    });
  }
}
