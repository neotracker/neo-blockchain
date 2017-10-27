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
          level: 'error',
          data: {
            error,
            durationMS: performance.now() - startTime,
          },
        });
      }

      throw error;
    } finally {
      log({
        event: 'REQUEST',
        data: {
          type: 'request',
          durationMS: performance.now() - startTime,
        },
      });
    }
  };
}

export function onError({ log }: {| log: Log |}) {
  return (error: Error) => {
    log({
      event: 'UNEXPECTED_REQUEST_ERROR',
      level: 'error',
      data: { error },
    });
  };
}
