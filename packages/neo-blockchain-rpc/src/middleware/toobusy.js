/* @flow */
import { type Context } from 'koa';

import toobusy from 'toobusy-js';

export type TooBusyConfig = {|
  maxLag: number,
  smoothingFactor: number,
|};
export default ({
  maxLag,
  smoothingFactor,
}: {|
  maxLag: number,
  smoothingFactor: number,
|}) => {
  toobusy.maxLag(maxLag);
  toobusy.smoothingFactor(smoothingFactor);

  const middleware = async (ctx: Context, next: () => Promise<void>,) => {
    if (toobusy()) {
      ctx.status = 503;
      ctx.body = 'Server is too busy, try again later.';
    } else {
      await next();
    }
  };

  const shutdown = (): Promise<void> => new Promise((resolve) => {
    toobusy.shutdown();
    resolve();
  });

  return { middleware, shutdown };
}
