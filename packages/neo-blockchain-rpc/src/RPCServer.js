/* @flow */
import type { Blockchain, Node } from 'neo-blockchain-node-core';
import Koa from 'koa';

import _ from 'lodash';
import compose from 'koa-compose';
import compress from 'koa-compress';
import http from 'http';
import https from 'https';
import mount from 'koa-mount';
import ratelimit from 'koa-ratelimit-lru';

import {
  type TooBusyConfig,
  bodyParser,
  cors,
  loadBalancerHealthCheck,
  logger,
  machineHealthCheck,
  onError,
  rpc,
  // toobusy,
} from './middleware';

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
  toobusy?: TooBusyConfig,
  ratelimit?: {|
    rate?: number,
    duration?: number,
    throw?: boolean,
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
  toobusy: TooBusyConfig,
  ratelimit: {|
    rate: number,
    duration: number,
    throw: boolean,
  |},
|}

const DEFAULT_SETTINGS = {
  server: {
    keepAliveTimeout: 650000,
  },
  toobusy: {
    maxLag: 500,
    smoothingFactor: 1 / 3,
  },
  ratelimit: {
    rate: 500 * 60, // Allow 100 requests per second
    duration: 60 * 1000, // 60 seconds
    throw: true,
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

  constructor({
    blockchain,
    node,
    rpcEndpoints,
    settings,
  }: RPCServerOptions) {
    this._blockchain = blockchain;
    this._node = node;
    this._rpcEndpoints = rpcEndpoints;
    this._settings = _.merge({}, DEFAULT_SETTINGS, settings || {});
    this._shutdownFuncs = [];
  }

  async start(): Promise<void> {
    this._blockchain.logger({ event: 'SERVER_START' });
    const app = new Koa();
    app.proxy = true;
    // We have our own handlers for errors
    // $FlowFixMe
    app.silent = true;
    app.on('error', onError({
      logger: this._blockchain.logger,
      identifier: this._blockchain.identifier,
    }));

    app.use(mount('/machine_health_check', machineHealthCheck));
    app.use(mount('/lb_health_check', loadBalancerHealthCheck({
      blockchain: this._blockchain,
      rpcEndpoints: this._rpcEndpoints,
    })))

    app.use(logger({
      logger: this._blockchain.logger,
      identifier: this._blockchain.identifier,
    }));
    app.use(cors);

    // TODO: Re-enable?
    // const { middleware: toobusyMiddleware, shutdown } = toobusy(
    //   this._settings.toobusy || DEFAULT_SETTINGS.toobusy,
    // );
    // app.use(toobusyMiddleware);
    // this._shutdownFuncs.push(shutdown);

    app.use(ratelimit(this._settings.ratelimit))
    app.use(mount('/rpc', compose([compress(), bodyParser(), rpc({
      blockchain: this._blockchain,
      node: this._node,
    })])));

    await Promise.all([
      this._startHTTPServer(app),
      this._startHTTPSServer(app),
    ])
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
    const httpServer = http.createServer(app.callback())
    // $FlowFixMe
    httpServer.keepAliveTimeout = this._settings.server.keepAliveTimeout;
    await new Promise((resolve) => httpServer.listen(
      port,
      host,
      511,
      () => resolve(),
    ));
    this._blockchain.logger({
      event: 'SERVER_LISTENING',
      message: `Server listening on ${host}:${port}`,
    });
    this._shutdownFuncs.push(
      () => new Promise((resolve) => httpServer.close(() => resolve())),
    );
  }

  async _startHTTPSServer(app: Koa): Promise<void> {
    const httpsOptions = this._settings.server.https;
    if (httpsOptions == null) {
      return;
    }

    const { key, cert, host, port } = httpsOptions;
    const httpsServer = https.createServer({ key, cert }, app.callback())
    // $FlowFixMe
    httpsServer.keepAliveTimeout = this._settings.server.keepAliveTimeout;
    await new Promise((resolve) => httpsServer.listen(
      port,
      host,
      511,
      () => resolve(),
    ));
    this._blockchain.logger({
      event: 'SERVER_LISTENING',
      message: `Server listening on ${host}:${port}`,
    });
    this._shutdownFuncs.push(
      () => new Promise((resolve) => httpsServer.close(() => resolve())),
    );
  }
}
