/* @flow */
import type { Blockchain, Log, Node } from 'neo-blockchain-node-core';
import Koa from 'koa';
import type { Observable } from 'rxjs/Observable';

import http from 'http';
import https from 'https';

import {
  type CreateLogForContext,
  type CreateProfile,
  type ReadyHealthCheckOptions,
  type ServerMiddleware,
  context,
  cors,
  liveHealthCheck,
  logger,
  onError,
  readyHealthCheck,
  rpc,
} from './middleware';

export type ServerOptions = {|
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
|};

export type Options = {|
  server: ServerOptions,
  readyHealthCheck: ReadyHealthCheckOptions,
|};

export default class RPCServer {
  _log: Log;
  _createLogForContext: CreateLogForContext;
  _createProfile: CreateProfile;
  _blockchain$: Observable<Blockchain>;
  _node$: Observable<Node>;
  _options$: Observable<Options>;
  _shutdownFuncs: Array<() => Promise<void> | void>;

  constructor({
    log,
    createLogForContext,
    createProfile,
    blockchain$,
    node$,
    options$,
  }: {|
    log: Log,
    createLogForContext: CreateLogForContext,
    createProfile: CreateProfile,
    blockchain$: Observable<Blockchain>,
    node$: Observable<Node>,
    options$: Observable<Options>,
  |}) {
    this._log = log;
    this._createLogForContext = createLogForContext;
    this._createProfile = createProfile;
    this._blockchain$ = blockchain$;
    this._node$ = node$;
    this._options$ = options$;
    this._shutdownFuncs = [];
  }

  async start(): Promise<void> {
    this._log({ event: 'SERVER_START' });
    const app = new Koa();
    app.proxy = true;
    // We have our own handlers for errors
    // $FlowFixMe
    app.silent = true;
    app.on('error', onError({ log: this._log }));

    const [readyHealthCheckMiddleware, rpcMiddleware] = await Promise.all([
      readyHealthCheck({
        blockchain$: this._blockchain$,
        options$: this._options$
          .map(options => options.readyHealthCheck)
          .distinct(),
      }),
      rpc({
        blockchain$: this._blockchain$,
        node$: this._node$,
      }),
    ]);

    this.addMiddleware(
      app,
      context({
        createLog: this._createLogForContext,
        createProfile: this._createProfile,
      }),
    );
    this.addMiddleware(app, liveHealthCheck);
    this.addMiddleware(app, readyHealthCheckMiddleware);
    this.addMiddleware(app, logger);
    this.addMiddleware(app, cors);
    this.addMiddleware(app, rpcMiddleware);

    await Promise.all([
      this._startHTTPServer(app),
      this._startHTTPSServer(app),
    ]);
  }

  addMiddleware(app: Koa, { middleware, stop }: ServerMiddleware): void {
    app.use(middleware);
    this._shutdownFuncs.push(stop);
  }

  async stop(): Promise<void> {
    await Promise.all(this._shutdownFuncs.map(func => func()));
    this._shutdownFuncs = [];
  }

  async _startHTTPServer(app: Koa): Promise<void> {
    const options = await this._options$.take(1).toPromise();
    const httpOptions = options.server.http;
    if (httpOptions == null) {
      return;
    }

    const { host, port } = httpOptions;
    const httpServer = http.createServer(app.callback());
    // $FlowFixMe
    httpServer.keepAliveTimeout = options.server.keepAliveTimeout;
    await new Promise(resolve =>
      httpServer.listen(port, host, 511, () => resolve()),
    );
    this._log({ event: 'SERVER_LISTENING', host, port });
    this._shutdownFuncs.push(
      () => new Promise(resolve => httpServer.close(() => resolve())),
    );
  }

  async _startHTTPSServer(app: Koa): Promise<void> {
    const options = await this._options$.take(1).toPromise();
    const httpsOptions = options.server.https;
    if (httpsOptions == null) {
      return;
    }

    const { key, cert, host, port } = httpsOptions;
    const httpsServer = https.createServer({ key, cert }, app.callback());
    // $FlowFixMe
    httpsServer.keepAliveTimeout = options.server.keepAliveTimeout;
    await new Promise(resolve =>
      httpsServer.listen(port, host, 511, () => resolve()),
    );
    this._log({ event: 'SERVER_LISTENING', host, port });
    this._shutdownFuncs.push(
      () => new Promise(resolve => httpsServer.close(() => resolve())),
    );
  }
}
