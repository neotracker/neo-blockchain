/* @flow */
import { createLogger, transports as winstonTransports } from 'winston';

import createServerLogger from './createServerLogger';

const transports = [];
transports.push(
  new winstonTransports.Console({
    level: 'info',
  }),
);

export default createServerLogger(createLogger({ transports }));
