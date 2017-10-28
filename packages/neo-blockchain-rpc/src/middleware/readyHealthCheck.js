/* @flow */
import type { Blockchain } from 'neo-blockchain-node-core';
import type { Context } from 'koa';
import type { Observable } from 'rxjs/Observable';

import _ from 'lodash';
import mount from 'koa-mount';

import { getLog } from './common';
import { subscribeAndTake } from '../utils';

const TIMEOUT_MS = 5000;

const fetchCount = async (endpoint: string): Promise<?number> => {
  try {
    // eslint-disable-next-line
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify([
        {
          jsonrpc: '2.0',
          method: 'getblockcount',
          params: [],
          id: 4,
        },
      ]),
      timeout: TIMEOUT_MS,
    });
    if (!response.ok) {
      return null;
    }
    // eslint-disable-next-line
    const result = await response.json();
    if (Array.isArray(result)) {
      const responseJSON = result[0];
      if (responseJSON.error || responseJSON.result == null) {
        return null;
      }
      return responseJSON.result;
    }

    return null;
  } catch (error) {
    return null;
  }
};

const fetchTallestBlockIndex = async (
  rpcEndpoints: Array<string>,
): Promise<?number> => {
  const counts = await Promise.all(
    rpcEndpoints.map(rpcEndpoint => fetchCount(rpcEndpoint)),
  );
  return _.max(counts.filter(Boolean).map(count => count - 1));
};

export type Options = {|
  rpcEndpoints: Array<string>,
  offset: number,
|};

export default async ({
  blockchain$,
  options$,
}: {|
  blockchain$: Observable<Blockchain>,
  options$: Observable<Options>,
|}) => {
  let blockchain;
  let options;
  const [blockchainResult, optionsResult] = await Promise.all([
    subscribeAndTake({
      observable: blockchain$,
      next: nextBlockchain => {
        blockchain = nextBlockchain;
        return nextBlockchain;
      },
    }),
    subscribeAndTake({
      observable: options$,
      next: nextOptions => {
        options = nextOptions;
        return nextOptions;
      },
    }),
  ]);
  blockchain = blockchainResult.out;
  let blockchainSubscription = blockchainResult.subscription;
  options = optionsResult.out;
  let optionsSubscription = optionsResult.subscription;

  return {
    name: 'readyHealthCheck',
    middleware: mount('/ready_health_check', async (ctx: Context) => {
      const log = getLog(ctx);
      const index = await fetchTallestBlockIndex(options.rpcEndpoints);
      if (
        index == null ||
        blockchain.currentBlockIndex >= index - options.offset
      ) {
        ctx.status = 200;
      } else {
        log({
          event: 'READY_HEALTH_CHECK_ERROR',
          index,
          currentBlockIndex: blockchain.currentBlockIndex,
        });
        ctx.status = 500;
      }
    }),
    stop: () => {
      if (blockchainSubscription != null) {
        blockchainSubscription.unsubscribe();
        blockchainSubscription = null;
      }

      if (optionsSubscription != null) {
        optionsSubscription.unsubscribe();
        optionsSubscription = null;
      }
    },
  };
};
