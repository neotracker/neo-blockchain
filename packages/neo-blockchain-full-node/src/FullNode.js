/* @flow */
import Blockchain from 'neo-blockchain-impl';
import {
  type Blockchain as BlockchainType,
  type Endpoint,
  type Log,
} from 'neo-blockchain-node-core';
import Node from 'neo-blockchain-node';
import { Observable } from 'rxjs/Observable';
import { type Settings } from 'neo-blockchain-core';
import {
  type CreateLogForContext,
  type CreateProfile,
  type RPCServerEnvironment,
  type RPCServerOptions,
  RPCServer,
} from 'neo-blockchain-rpc';
import type { Subscription } from 'rxjs/Subscription';

import leveldown from 'leveldown';
import levelup from 'levelup';
import levelUpStorage from 'neo-blockchain-levelup';
import vm from 'neo-blockchain-vm';

export type NodeOptions = {|
  seeds: Array<Endpoint>,
|};

export type Environment = {|
  dataPath: string,
  rpc: RPCServerEnvironment,
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
  _settings: Settings;
  _environment: Environment;
  _options$: Observable<Options>;
  _onError: () => void;
  _onCreateBlockchain: (blockchain: BlockchainType) => Promise<void>;
  _subscription: ?Subscription;
  _rpcServer: ?RPCServer;

  constructor({
    log,
    createLogForContext,
    createProfile,
    settings,
    environment,
    options$,
    onError,
    onCreateBlockchain,
  }: {|
    log: Log,
    createLogForContext: CreateLogForContext,
    createProfile: CreateProfile,
    settings: Settings,
    environment: Environment,
    options$: Observable<Options>,
    onError?: () => void,
    onCreateBlockchain?: (blockchain: BlockchainType) => Promise<void>,
  |}) {
    this._log = log;
    this._createLogForContext = createLogForContext;
    this._createProfile = createProfile;
    this._settings = settings;
    this._environment = environment;
    this._options$ = options$;
    this._onError = onError || (() => {});
    this._onCreateBlockchain =
      // eslint-disable-next-line
      onCreateBlockchain || (async (blockchain: BlockchainType) => {});
    this._subscription = null;
    this._rpcServer = null;
  }

  async start(): Promise<void> {
    const nodeAndBlockchain$ = this._getNodeAndBlockchain$();
    this._subscription = nodeAndBlockchain$.subscribe();
    this._startRPCServer(nodeAndBlockchain$);
  }

  _getNodeAndBlockchain$(): Observable<NodeAndBlockchain> {
    const dispose = async ({ storage, blockchain, node }) => {
      try {
        await node.stop();
        await blockchain.stop();
        await storage.close();
      } catch (error) {
        this._log({ event: 'FULL_NODE_DISPOSE_ERROR', error });
        await this.stop();
        this._onError();
      }
    };

    let currentResources = null;
    return this._options$
      .map(options => options.node)
      .distinct()
      .concatMap(options =>
        Observable.fromPromise(
          Promise.resolve().then(async () => {
            if (currentResources != null) {
              await dispose(currentResources);
            }

            const storage = levelUpStorage({
              db: levelup(leveldown(this._environment.dataPath)),
              context: { messageMagic: this._settings.messageMagic },
            });
            const blockchain = await Blockchain.create({
              settings: this._settings,
              storage,
              vm,
              log: this._log,
            });
            await this._onCreateBlockchain(blockchain);

            const node = new Node({ blockchain, seeds: options.seeds });
            node.start();

            currentResources = { storage, blockchain, node };
            return { node, blockchain };
          }),
        ),
      )
      .finally(() => {
        if (currentResources != null) {
          dispose(currentResources);
        }
      })
      .shareReplay(1);
  }

  async _startRPCServer(
    nodeAndBlockchain$: Observable<NodeAndBlockchain>,
  ): Promise<void> {
    this._rpcServer = new RPCServer({
      log: this._log,
      createLogForContext: this._createLogForContext,
      createProfile: this._createProfile,
      blockchain$: nodeAndBlockchain$.map(({ blockchain }) => blockchain),
      node$: nodeAndBlockchain$.map(({ node }) => node),
      environment: this._environment.rpc,
      options$: this._options$.map(options => options.rpc).distinct(),
      onError: this._onError,
    });
    await this._rpcServer.start();
  }

  async stop(): Promise<void> {
    if (this._rpcServer != null) {
      await this._rpcServer.stop();
      this._rpcServer = null;
    }
  }
}
