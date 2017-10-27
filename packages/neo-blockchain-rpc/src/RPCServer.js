/* @flow */
import type { Blockchain, Node } from 'neo-blockchain-node-core';
import Koa from 'koa';

import _ from 'lodash';
import compose from 'koa-compose';
import compress from 'koa-compress';
import http from 'http';
import https from 'https';
import mount from 'koa-mount';

import { bodyParser, cors, logger, onError, rpc } from './middleware';

export type RPCSettings = {|
  server?: {|
    http?: {|
      port: number,
      host: string,
    |},
    https?: {|
      key: Buffer,
      cert: Buffer,
      port: number,
      host: string,
    |},
    keepAliveTimeout?: number,
  |},
|};

type RPCSettingsInternal = {|
  server: {|
    http?: {|
      port: number,
      host: string,
    |},
    https?: {|
      key: string,
      cert: string,
      port: number,
      host: string,
    |},
    keepAliveTimeout: number,
  |},
|};

const DEFAULT_SETTINGS = {
  server: {
    keepAliveTimeout: 650000,
  },
};

export type RPCServerOptions = {|
  blockchain: Blockchain,
  node: Node,
  rpcEndpoints: Array<string>,
  settings?: RPCSettings,
|};

export default class RPCServer {
  _blockchain: Blockchain;
  _node: Node;
  _rpcEndpoints: Array<string>;
  _shutdownFuncs: Array<() => Promise<void>>;
  _settings: RPCSettingsInternal;

  constructor({ blockchain, node, rpcEndpoints, settings }: RPCServerOptions) {
    this._blockchain = blockchain;
    this._node = node;
    this._rpcEndpoints = rpcEndpoints;
    this._settings = _.merge({}, DEFAULT_SETTINGS, settings || {});
    this._shutdownFuncs = [];
  }

  async start(): Promise<void> {
    this._blockchain.log({ event: 'SERVER_START' });
    const app = new Koa();
    app.proxy = true;
    // We have our own handlers for errors
    // $FlowFixMe
    app.silent = true;
    app.on('error', onError({ log: this._blockchain.log }));

    app.use(logger({ log: this._blockchain.log }));
    app.use(cors);

    app.use(
      mount(
        '/rpc',
        compose([
          compress(),
          bodyParser(),
          rpc({
            blockchain: this._blockchain,
            node: this._node,
          }),
        ]),
      ),
    );

    await Promise.all([
      this._startHTTPServer(app),
      this._startHTTPSServer(app),
    ]);
  }

  async stop(): Promise<void> {
    await Promise.all(this._shutdownFuncs.map(func => func()));
    this._shutdownFuncs = [];
  }

  async _startHTTPServer(app: Koa): Promise<void> {
    const httpOptions = this._settings.server.http;
    if (httpOptions == null) {
      return;
    }

    const { host, port } = httpOptions;
    const httpServer = http.createServer(app.callback());
    // $FlowFixMe
    httpServer.keepAliveTimeout = this._settings.server.keepAliveTimeout;
    await new Promise(resolve =>
      httpServer.listen(port, host, 511, () => resolve()),
    );
    this._blockchain.log({
      event: 'SERVER_LISTENING',
      message: `Server listening on ${host}:${port}`,
    });
    this._shutdownFuncs.push(
      () => new Promise(resolve => httpServer.close(() => resolve())),
    );
  }

  async _startHTTPSServer(app: Koa): Promise<void> {
    const httpsOptions = this._settings.server.https;
    if (httpsOptions == null) {
      return;
    }

    const { key, cert, host, port } = httpsOptions;
    const httpsServer = https.createServer({ key, cert }, app.callback());
    // $FlowFixMe
    httpsServer.keepAliveTimeout = this._settings.server.keepAliveTimeout;
    await new Promise(resolve =>
      httpsServer.listen(port, host, 511, () => resolve()),
    );
    this._blockchain.log({
      event: 'SERVER_LISTENING',
      message: `Server listening on ${host}:${port}`,
    });
    this._shutdownFuncs.push(
      () => new Promise(resolve => httpsServer.close(() => resolve())),
    );
  }
}
