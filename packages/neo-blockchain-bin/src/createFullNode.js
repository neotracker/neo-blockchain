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

  const log = createServerLogger(new winston.Logger({ transports }));

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
      rpcEndpoints: [
        'http://test1.cityofzion.io:8880',
        'http://test2.cityofzion.io:8880',
        'http://test3.cityofzion.io:8880',
        'http://test4.cityofzion.io:8880',
        'http://test5.cityofzion.io:8880',
        'http://seed1.neo.org:20332',
        'http://seed2.neo.org:20332',
        'http://seed3.neo.org:20332',
        'http://seed4.neo.org:20332',
        'http://seed5.neo.org:20332',
      ],
      log,
      identifier: 'testnet',
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
      rpcEndpoints: [
        'http://seed1.cityofzion.io:8080',
        'http://seed2.cityofzion.io:8080',
        'http://seed3.cityofzion.io:8080',
        'http://seed4.cityofzion.io:8080',
        'http://seed5.cityofzion.io:8080',
        'http://seed1.neo.org:10332',
        'http://seed2.neo.org:10332',
        'http://seed3.neo.org:10332',
        'http://seed4.neo.org:10332',
        'http://seed5.neo.org:10332',
      ],
      log,
      identifier: 'mainnet',
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
