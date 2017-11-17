/* @flow */
import {
  type Blockchain,
  createEndpoint,
  createProfile,
} from 'neo-blockchain-node-core';
import { type Chain, loadChain, dumpChain } from 'neo-blockchain-offline';
import fullNode$ from 'neo-blockchain-full-node';
import { ReplaySubject } from 'rxjs/ReplaySubject';

import { main, test } from 'neo-blockchain-neo-settings';
import { createLogger, transports as winstonTransports } from 'winston';

import createServerLogger from './createServerLogger';
import resolveHome from './resolveHome';

export default ({
  testNet,
  dataPath: dataPathIn,
  chain: chainIn,
  dumpPath: dumpPathIn,
}: {
  testNet: boolean,
  dataPath: string,
  chain?: Chain,
  dumpPath?: string,
}) => {
  const transports = [];
  transports.push(
    new winstonTransports.Console({
      level: 'debug',
    }),
  );

  const log = createServerLogger(createLogger({ transports }));

  const dataPath = resolveHome(dataPathIn);

  let onCreateBlockchain;
  const dumpPath = dumpPathIn;
  const chain = chainIn;
  if (dumpPath != null) {
    onCreateBlockchain = async (blockchain: Blockchain) => {
      await dumpChain({ blockchain, path: dumpPath });
    };
  } else if (chain != null) {
    onCreateBlockchain = async (blockchain: Blockchain) => {
      await loadChain({ blockchain, chain });
    };
  }

  let settings;
  let options;
  let rpcEnvironment;
  if (testNet) {
    settings = test;
    rpcEnvironment = {
      http: {
        host: '0.0.0.0',
        port: 8081,
      },
    };
    options = {
      node: {
        seeds: [
          { type: 'tcp', host: 'seed1.neo.org', port: 20333 },
          { type: 'tcp', host: 'seed2.neo.org', port: 20333 },
          { type: 'tcp', host: 'seed3.neo.org', port: 20333 },
          { type: 'tcp', host: 'seed4.neo.org', port: 20333 },
          { type: 'tcp', host: 'seed5.neo.org', port: 20333 },
        ].map(value => createEndpoint(value)),
      },
      rpc: {
        server: {
          keepAliveTimeout: 65000,
        },
        readyHealthCheck: {
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
          offset: 1,
        },
      },
    };
  } else {
    settings = main;
    rpcEnvironment = {
      http: {
        host: '0.0.0.0',
        port: 8081,
      },
    };
    options = {
      node: {
        seeds: [
          { type: 'tcp', host: 'seed1.neo.org', port: 10333 },
          { type: 'tcp', host: 'seed2.neo.org', port: 10333 },
          { type: 'tcp', host: 'seed3.neo.org', port: 10333 },
          { type: 'tcp', host: 'seed4.neo.org', port: 10333 },
          { type: 'tcp', host: 'seed5.neo.org', port: 10333 },
        ].map(value => createEndpoint(value)),
      },
      rpc: {
        server: {
          keepAliveTimeout: 65000,
        },
        readyHealthCheck: {
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
          offset: 1,
        },
      },
    };
  }

  const subject = new ReplaySubject(1);
  subject.next(options);
  return fullNode$({
    log,
    createLogForContext: () => log,
    createProfile,
    settings,
    environment: {
      dataPath,
      rpc: rpcEnvironment,
    },
    options$: subject,
    onCreateBlockchain,
  });
};
