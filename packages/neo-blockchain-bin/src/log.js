/* @flow */
import winston from 'winston';

import createServerLogger from './createServerLogger';

const transports = [];
transports.push(
  new winston.transports.Console({
    level: 'info',
  }),
);

export default createServerLogger(winston.createLogger({ transports }));
