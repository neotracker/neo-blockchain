/* @flow */
import type { Blockchain, Log, Node } from 'neo-blockchain-node-core';
import Koa from 'koa';
import { Observable } from 'rxjs/Observable';

import http from 'http';
import https from 'https';

import {
  type CreateLogForContext,
  type CreateProfile,
  type ReadyHealthCheckOptions,
  context,
  cors,
  liveHealthCheck,
  logger,
  onError as appOnError,
  readyHealthCheck,
  rpc,
} from './middleware';

export type ServerOptions = {|
  keepAliveTimeout: number,
|};

export type Environment = {|
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
  _environment: Environment;
  _options$: Observable<Options>;
  _shutdownFuncs: Array<() => Promise<void> | void>;
  _onError: () => void;

  constructor({
    log,
    createLogForContext,
    createProfile,
    blockchain$,
    node$,
    environment,
    options$,
    onError,
  }: {|
    log: Log,
    createLogForContext: CreateLogForContext,
    createProfile: CreateProfile,
    blockchain$: Observable<Blockchain>,
    node$: Observable<Node>,
    environment: Environment,
    options$: Observable<Options>,
    onError?: () => void,
  |}) {
    this._log = log;
    this._createLogForContext = createLogForContext;
    this._createProfile = createProfile;
    this._blockchain$ = blockchain$;
    this._node$ = node$;
    this._environment = environment;
    this._options$ = options$;
    this._shutdownFuncs = [];
    this._onError = onError || (() => {});
  }

  async start(): Promise<void> {
    this._log({ event: 'SERVER_START' });
    const app$ = this._getApp$();

    await Promise.all([
      this._startHTTPServer(app$),
      this._startHTTPSServer(app$),
    ]);
  }

  async stop(): Promise<void> {
    await Promise.all(this._shutdownFuncs.map(func => func()));
    this._shutdownFuncs = [];
  }

  async _startHTTPServer(app$: Observable<Koa>): Promise<void> {
    const httpOptions = this._environment.http;
    if (httpOptions == null) {
      return;
    }

    const { host, port } = httpOptions;
    const httpServer = http.createServer();
    await this._setupServer(httpServer, host, port, app$);
  }

  async _startHTTPSServer(app$: Observable<Koa>): Promise<void> {
    const httpsOptions = this._environment.https;
    if (httpsOptions == null) {
      return;
    }

    const { key, cert, host, port } = httpsOptions;
    const httpsServer = https.createServer({ key, cert });
    await this._setupServer(httpsServer, host, port, app$);
  }

  _getApp$(): Observable<Koa> {
    return Observable.combineLatest(
      this._blockchain$,
      this._node$,
      this._options$.map(options => options.readyHealthCheck).distinct(),
    )
      .map(([blockchain, node, readyHealthCheckOptions]) => {
        const app = new Koa();
        app.proxy = true;
        // $FlowFixMe
        app.silent = true;

        app.on('error', appOnError({ log: this._log }));

        const middlewares = [
          context({
            createLog: this._createLogForContext,
            createProfile: this._createProfile,
          }),
          liveHealthCheck,
          readyHealthCheck({ blockchain, options: readyHealthCheckOptions }),
          logger,
          cors,
          rpc({ blockchain, node }),
        ];

        for (const middleware of middlewares) {
          app.use(middleware.middleware);
        }

        return app;
      })
      .publishReplay(1)
      .refCount();
  }

  async _setupServer(
    server: http.Server | https.Server,
    host: string,
    port: number,
    app$: Observable<Koa>,
  ): Promise<void> {
    const onError = event => error => {
      this._log({ event, error });
      this.stop().then(() => this._onError());
    };
    let listener;
    const subscription = app$.subscribe({
      next: app => {
        if (listener != null) {
          server.removeListener('request', listener);
        }

        listener = app.callback();
        server.on('request', listener);
      },
      error: (onError('SERVER_APP_SUBSCRIBE_ERROR'): $FlowFixMe),
    });
    this._shutdownFuncs.push(() => subscription.unsubscribe());

    const keepAliveSubscription = this._options$
      .map(options => options.server.keepAliveTimeout)
      .distinct()
      .subscribe({
        next: keepAliveTimeout => {
          // $FlowFixMe
          server.keepAliveTimeout = keepAliveTimeout; // eslint-disable-line
        },
        error: (onError('SERVER_KEEP_ALIVE_SUBSCRIBE_ERROR'): $FlowFixMe),
      });
    this._shutdownFuncs.push(() => keepAliveSubscription.unsubscribe());

    await new Promise(resolve =>
      server.listen(port, host, 511, () => resolve()),
    );
    this._log({ event: 'SERVER_LISTENING', host, port });
    this._shutdownFuncs.push(
      () => new Promise(resolve => server.close(() => resolve())),
    );
  }
}
