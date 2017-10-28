/* @flow */
import type { Context } from 'koa';
import type { Log, Profile } from 'neo-blockchain-node-core';

import { getUA } from '../utils';
import { simpleMiddleware } from './common';

export type CreateLogForContext = (ctx: Context) => Log;
export type CreateProfile = (log: Log) => Profile;

export default ({
  createLog,
  createProfile,
}: {|
  createLog: CreateLogForContext,
  createProfile: CreateProfile,
|}) =>
  simpleMiddleware(
    'context',
    async (ctx: Context, next: () => Promise<void>) => {
      const { userAgent, type, error } = getUA(
        ctx.request.headers['user-agent'],
      );
      ctx.state.userAgent = userAgent;

      const log = createLog(ctx);
      ctx.state.log = log;
      ctx.state.profile = createProfile(log);

      if (type === 'error') {
        log({ event: 'USER_AGENT_PARSE_ERROR', error });
      }

      await next();
    },
  );
