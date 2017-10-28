/* @flow */
import type { Context } from 'koa';
import { type Log } from 'neo-blockchain-node-core';

// $FlowFixMe
import { performance } from 'perf_hooks'; // eslint-disable-line

export default function({ log }: {| log: Log |}) {
  return async (ctx: Context, next: () => Promise<void>) => {
    const startTime = performance.now();
    try {
      await next();
    } catch (error) {
      if (error.code !== 'ECONNABORTED') {
        log({
          event: 'REQUEST_ERROR',
          error,
          durationMS: performance.now() - startTime,
        });
      }

      throw error;
    } finally {
      log({
        event: 'REQUEST',
        durationMS: performance.now() - startTime,
      });
    }
  };
}

export function onError({ log }: {| log: Log |}) {
  return (error: Error) => {
    log({
      event: 'UNEXPECTED_REQUEST_ERROR',
      error,
    });
  };
}
