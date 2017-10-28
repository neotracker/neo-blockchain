/* @flow */
import Blockchain from 'neo-blockchain-impl';
import {
  type Blockchain as BlockchainType,
  type Endpoint,
  type Log,
  type Storage,
} from 'neo-blockchain-node-core';
import { type Chain, dumpChain, loadChain } from 'neo-blockchain-offline';
import Node from 'neo-blockchain-node';
import { Observable } from 'rxjs/Observable';
import { type Settings } from 'neo-blockchain-core';
import {
  type CreateLogForContext,
  type CreateProfile,
  type RPCServerOptions,
  RPCServer,
  subscribeAndTake,
} from 'neo-blockchain-rpc';
import type { Subscription } from 'rxjs/Subscription';

import leveldown from 'leveldown';
import levelup from 'levelup';
import levelUpStorage from 'neo-blockchain-levelup';
import vm from 'neo-blockchain-vm';

export type NodeOptions = {|
  seeds: Array<Endpoint>,
  settings: Settings,
  dataPath: string,
  chain: {|
    enabled: boolean,
    chain: Chain,
  |},
|};

export type Options = {|
  node: NodeOptions,
  rpc: RPCServerOptions,
|};

type NodeAndBlockchain = {|
  node: Node,
  blockchain: BlockchainType,
|};

export default class FullNode {
  _log: Log;
  _createLogForContext: CreateLogForContext;
  _createProfile: CreateProfile;
  _options$: Observable<Options>;
  _blockchain: ?BlockchainType;
  _node: ?Node;
  _rpcServer: ?RPCServer;
  _storage: ?Storage;
  _subscription: ?Subscription;
  _nodeAndBlockchain$: Observable<NodeAndBlockchain>;

  constructor({
    log,
    createLogForContext,
    createProfile,
    options$,
  }: {|
    log: Log,
    createLogForContext: CreateLogForContext,
    createProfile: CreateProfile,
    options$: Observable<Options>,
  |}) {
    this._log = log;
    this._createLogForContext = createLogForContext;
    this._createProfile = createProfile;
    this._options$ = options$;
    this._blockchain = null;
    this._node = null;
    this._rpcServer = null;
    this._storage = null;
    this._subscription = null;

    this._nodeAndBlockchain$ = this._options$
      .map(options => options.node)
      .distinct()
      .concatMap(options =>
        Observable.fromPromise(this._stop().then(() => this._start(options))),
      )
      .publishReplay(1)
      .refCount();
  }

  async start(): Promise<void> {
    // eslint-disable-next-line
    const [result, _] = await Promise.all([
      subscribeAndTake({
        observable: this._nodeAndBlockchain$,
        next: () => {},
      }),
      this._startRPCServer(),
    ]);
    this._subscription = result.subscription;
  }

  async _start(options: NodeOptions): Promise<NodeAndBlockchain> {
    this._storage = levelUpStorage({
      db: levelup(leveldown(options.dataPath)),
      context: { messageMagic: options.settings.messageMagic },
    });
    const blockchain = await Blockchain.create({
      settings: options.settings,
      storage: this._storage,
      vm,
      log: this._log,
    });
    this._blockchain = blockchain;
    if (options.chain.enabled) {
      await loadChain({
        blockchain,
        chain: options.chain.chain,
      });
    }

    const node = new Node({ blockchain, seeds: options.seeds });
    this._node = node;
    node.start();

    return { node, blockchain };
  }

  async _startRPCServer(): Promise<void> {
    const rpcServer = new RPCServer({
      log: this._log,
      createLogForContext: this._createLogForContext,
      createProfile: this._createProfile,
      blockchain$: this._nodeAndBlockchain$.map(({ blockchain }) => blockchain),
      node$: this._nodeAndBlockchain$.map(({ node }) => node),
      options$: this._options$.map(options => options.rpc).distinct(),
    });
    this._rpcServer = rpcServer;
    await rpcServer.start();
  }

  async stop(): Promise<void> {
    if (this._subscription != null) {
      this._subscription.unsubscribe();
      this._subscription = null;
    }

    if (this._rpcServer != null) {
      await this._rpcServer.stop();
      this._rpcServer = null;
    }

    await this._stop();
  }

  async _stop(): Promise<void> {
    if (this._node != null) {
      this._node.stop();
      this._node = null;
    }

    if (this._storage != null) {
      await this._storage.close();
      this._storage = null;
    }
  }

  async dump(outPath: string): Promise<void> {
    if (this._blockchain != null) {
      await dumpChain({
        blockchain: this._blockchain,
        path: outPath,
      });
    }
  }
}
