/* @flow */
import Blockchain from 'neo-blockchain-impl';
import {
  type Blockchain as BlockchainType,
  type Endpoint,
  type Log,
  finalize,
  neverComplete,
} from 'neo-blockchain-node-core';
import Node from 'neo-blockchain-node';
import { Observable } from 'rxjs/Observable';
import { type Settings } from 'neo-blockchain-core';
import {
  type CreateLogForContext,
  type CreateProfile,
  type RPCServerEnvironment,
  type RPCServerOptions,
  rpcServer$,
} from 'neo-blockchain-rpc';

import { defer } from 'rxjs/observable/defer';
import { concatMap, distinct, map } from 'rxjs/operators';
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
  levelDownOptions?: {|
    createIfMissing?: boolean,
    errorIfExists?: boolean,
    compression?: boolean,
    cacheSize?: number,
    writeBufferSize?: number,
    blockSize?: number,
    maxOpenFiles?: number,
    blockRestartInterval?: number,
    maxFileSize?: number,
  |},
|};

export type Options = {|
  node: NodeOptions,
  rpc: RPCServerOptions,
|};

export default ({
  log,
  createLogForContext,
  createProfile,
  settings,
  environment,
  options$,
  onCreateBlockchain,
}: {|
  log: Log,
  createLogForContext: CreateLogForContext,
  createProfile: CreateProfile,
  settings: Settings,
  environment: Environment,
  options$: Observable<Options>,
  onCreateBlockchain?: (blockchain: BlockchainType) => Promise<void>,
|}) =>
  defer(async () => {
    const storage = levelUpStorage({
      db: levelup(
        leveldown(environment.dataPath, environment.levelDownOptions),
      ),
      context: { messageMagic: settings.messageMagic },
    });
    const blockchain = await Blockchain.create({
      settings,
      storage,
      vm,
      log,
    });
    if (onCreateBlockchain != null) {
      await onCreateBlockchain(blockchain);
    }

    const node = new Node({
      blockchain,
      seeds$: options$.pipe(map(options => options.node.seeds), distinct()),
    });
    node.start();

    return { node, blockchain, storage };
  }).pipe(
    neverComplete(),
    finalize(async result => {
      if (result != null) {
        await result.node.stop();
        await result.blockchain.stop();
        await result.storage.close();
      }
    }),
    concatMap(({ node, blockchain }) =>
      rpcServer$({
        log,
        createLogForContext,
        createProfile,
        blockchain,
        node,
        environment: environment.rpc,
        options$: options$.pipe(map(options => options.rpc), distinct()),
      }),
    ),
  );
