/* @flow */
import winston from 'winston';

const transports = [];
transports.push(new winston.transports.Console({
  level: 'info',
}));

export default new winston.Logger({ transports });
