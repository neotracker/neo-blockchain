/* @flow */
import { type Context } from 'koa';

export default async (ctx: Context): Promise<void> => {
  ctx.status = 200;
};
