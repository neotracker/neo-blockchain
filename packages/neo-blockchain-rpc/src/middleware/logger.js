/* @flow */
import type { Context, Response, Request } from 'koa';
import {
  type Logger,
  type RequestLog,
  type ResponseLog,
  type RPCLoggingContext,
} from 'neo-blockchain-node-core';

// $FlowFixMe
import { performance } from 'perf_hooks'; // eslint-disable-line
import uuidV4 from 'uuid/v4';

const getLoggingContext = (
  ctx: Context,
  identifier: string,
): RPCLoggingContext => ({
  type: 'rpc',
  request: {
    id: uuidV4(),
    start: Math.round(Date.now() / 1000),
  },
  userAgent: ctx.request.headers['user-agent'],
  identifier,
});

const getRequestLog = (request: Request): RequestLog => ({
  headers: request.headers,
  httpVersion: (request.httpVersion: $FlowFixMe),
  originalUrl: request.originalUrl,
  query: request.query,
});

const getResponseLog = (response: Response): ResponseLog => ({
  status: response.status,
});

export default function({
  logger,
  identifier,
}: {
  logger: Logger,
  identifier: string,
}) {
  return async (ctx: Context, next: () => Promise<void>) => {
    const startTime = performance.now();
    const loggingContext = getLoggingContext(ctx, identifier);
    // eslint-disable-next-line
    ctx.state.loggingContext = loggingContext;
    try {
      await next();
    } catch (error) {
      if (error.code !== 'ECONNABORTED') {
        logger({
          event: 'REQUEST_ERROR',
          level: 'error',
          meta: {
            type: 'requestError',
            error,
            request: getRequestLog(ctx.request),
            response: getResponseLog(ctx.response),
            durationMS: performance.now() - startTime,
          },
          context: loggingContext,
        });
      }

      throw error;
    } finally {
      logger({
        event: 'REQUEST',
        meta: {
          type: 'request',
          request: getRequestLog(ctx.request),
          response: getResponseLog(ctx.response),
          durationMS: performance.now() - startTime,
        },
        context: loggingContext,
      });
    }
  };
}

export function onError({
  logger,
  identifier,
}: {
  logger: Logger,
  identifier: string,
}) {
  return (error: Error, ctx?: Context) => {
    logger({
      event: 'UNEXPECTED_REQUEST_ERROR',
      level: 'error',
      meta: {
        type: 'unexpectedRequestError',
        error,
        request: ctx == null ? null : getRequestLog(ctx.request),
        response: ctx == null ? null : getResponseLog(ctx.response),
      },
      context: ctx == null ? null : getLoggingContext(ctx, identifier),
    });
  };
}
