/* @flow */
import FullNode, { type Chain } from 'neo-blockchain-full-node';

import { createEndpoint } from 'neo-blockchain-node-core';
import { main, test } from 'neo-blockchain-neo-settings';
import winston from 'winston';

import createServerLogger from './createServerLogger';
import resolveHome from './resolveHome';

export default async ({
  testNet,
  dataPath: dataPathIn,
  chain: chainIn,
}: {
  testNet: boolean,
  dataPath: string,
  chain?: Chain,
}) => {
  const transports = [];
  transports.push(
    new winston.transports.Console({
      level: 'debug',
    }),
  );

  const log = createServerLogger(winston.createLogger({ transports }));

  const dataPath = resolveHome(dataPathIn);
  const chain =
    chainIn == null
      ? chainIn
      : {
          format: chainIn.format,
          path: resolveHome(chainIn.path),
        };

  let options;
  if (testNet) {
    options = {
      settings: test,
      seeds: [
        { type: 'tcp', host: 'seed1.neo.org', port: 20333 },
        { type: 'tcp', host: 'seed2.neo.org', port: 20333 },
        { type: 'tcp', host: 'seed3.neo.org', port: 20333 },
        { type: 'tcp', host: 'seed4.neo.org', port: 20333 },
        { type: 'tcp', host: 'seed5.neo.org', port: 20333 },
      ].map(value => createEndpoint(value)),
      dataPath,
      chain,
      log,
      rpcSettings: {
        server: {
          http: {
            host: '0.0.0.0',
            port: 8081,
          },
        },
      },
    };
  } else {
    options = {
      settings: main,
      seeds: [
        { type: 'tcp', host: 'seed1.neo.org', port: 10333 },
        { type: 'tcp', host: 'seed2.neo.org', port: 10333 },
        { type: 'tcp', host: 'seed3.neo.org', port: 10333 },
        { type: 'tcp', host: 'seed4.neo.org', port: 10333 },
        { type: 'tcp', host: 'seed5.neo.org', port: 10333 },
      ].map(value => createEndpoint(value)),
      dataPath,
      chain,
      log,
      rpcSettings: {
        server: {
          http: {
            host: '0.0.0.0',
            port: 8081,
          },
        },
      },
    };
  }

  const node = await FullNode.create(options);
  return node;
};
