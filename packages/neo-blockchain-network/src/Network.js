/* @flow */
import { type Duplex } from 'stream';
import {
  type Endpoint,
  createEndpoint,
  getEndpointConfig,
} from 'neo-blockchain-node-core';

import net from 'net';
import { utils } from 'neo-blockchain-core';

import ConnectedPeer from './ConnectedPeer';
import { type OnEvent } from './event';
import type Peer from './Peer';
import TCPPeer from './TCPPeer';
import { UnsupportedEndpointType } from './errors';

export type ListenTCP = {|
  port: number,
  host?: string,
|};

export type NegotiateResult<PeerData> = {|
  data: PeerData,
  relay: boolean,
|};

type NetworkOptions<Message, PeerData> = {|
  seeds: Array<Endpoint>,
  listenTCP?: ListenTCP,
  externalEndpoints?: Array<Endpoint>,
  connectPeersDelayMS?: number,
  maxConnectedPeers?: number,
  socketTimeoutMS?: number,
  negotiate: (peer: Peer<Message>) => Promise<NegotiateResult<PeerData>>,
  createMessageTransform: () => Duplex,
  onMessageReceived: (
    peer: ConnectedPeer<Message, PeerData>,
    message: Message,
  ) => void,
  onRequestEndpoints: () => void,
  onEvent?: OnEvent<Message, PeerData>,
|};

const emptyFunction = () => {};

export default class Network<Message, PeerData> {
  _started: boolean;
  _stopped: boolean;

  _externalEndpoints: Set<Endpoint>;
  _connectPeersDelayMS: number;
  _maxConnectedPeers: number;
  _seeds: Array<Endpoint>;
  _socketTimeoutMS: number;

  _connectedPeers: { [endpoint: Endpoint]: ConnectedPeer<Message, PeerData> };
  _connectingPeers: { [endpoint: Endpoint]: boolean };
  _unconnectedPeers: Set<Endpoint>;

  _listenTCP: ?ListenTCP;
  _tcpServer: ?net.Server;

  _connectPeersTimeout: ?number;

  __negotiate: (peer: Peer<Message>) => Promise<NegotiateResult<PeerData>>;
  __createMessageTransform: () => Duplex;
  __onMessageReceived: (
    peer: ConnectedPeer<Message, PeerData>,
    message: Message,
  ) => void;
  __onRequestEndpoints: () => void;
  __onEvent: OnEvent<Message, PeerData>;

  constructor(options: NetworkOptions<Message, PeerData>) {
    this._started = false;
    this._stopped = false;

    this._externalEndpoints = new Set(options.externalEndpoints || []);
    this._connectPeersDelayMS = options.connectPeersDelayMS || 1000;
    this._maxConnectedPeers = options.maxConnectedPeers || 10;
    this._seeds = options.seeds;
    this._socketTimeoutMS = options.socketTimeoutMS || 1000 * 60;

    this._connectedPeers = {};
    this._connectingPeers = {};
    this._unconnectedPeers = new Set();

    this._listenTCP = options.listenTCP;
    this._tcpServer = null;

    this._connectPeersTimeout = null;

    this.__negotiate = options.negotiate;
    this.__createMessageTransform = options.createMessageTransform;
    this.__onMessageReceived = options.onMessageReceived;
    this.__onRequestEndpoints = options.onRequestEndpoints;
    this.__onEvent = options.onEvent || emptyFunction;

    if (this._seeds.length === 0) {
      throw new Error('Must have at least one seed.');
    }

    // $FlowFixMe
    this._onError = this._onError.bind(this);
    // $FlowFixMe
    this._onClose = this._onClose.bind(this);
  }

  start(): void {
    if (this._started) {
      return;
    }
    this._started = true;
    this._stopped = false;

    this.__onEvent({
      event: 'NETWORK_START',
      message: 'Network starting...',
    });

    try {
      this._startServer();
    } catch (error) {
      this._started = false;
      throw error;
    }

    try {
      this._run();
    } catch (error) {
      this._started = false;
      throw error;
    }
  }

  stop(): void {
    if (this._stopped || !this._started) {
      return;
    }
    this._stopped = true;

    this.__onEvent({
      event: 'NETWORK_STOP',
      message: 'Network stopping...',
    });

    try {
      if (this._connectPeersTimeout != null) {
        clearTimeout(this._connectPeersTimeout);
        this._connectPeersTimeout = null;
      }

      utils.keys(this._connectedPeers).forEach(endpoint => {
        this._connectedPeers[endpoint].close();
        delete this._connectedPeers[endpoint];
      });

      if (this._tcpServer != null) {
        this._tcpServer.close();
      }

      this._started = false;
    } catch (error) {
      this._stopped = false;
      throw error;
    }
  }

  addEndpoint(endpoint: Endpoint): void {
    if (!this._externalEndpoints.has(endpoint)) {
      this._unconnectedPeers.add(endpoint);
    }
  }

  relay(buffer: Buffer): void {
    for (const peer of utils.values(this._connectedPeers)) {
      if (peer.relay) {
        peer.write(buffer);
      }
    }
  }

  get connectedPeers(): Array<ConnectedPeer<Message, PeerData>> {
    return utils.values(this._connectedPeers);
  }

  _startServer(): void {
    const listenTCP = this._listenTCP;
    if (listenTCP == null) {
      return;
    }

    const tcpServer = net.createServer({ pauseOnConnect: true }, socket => {
      const host = socket.remoteAddress;
      if (host == null) {
        socket.end();
        return;
      }
      const endpoint = createEndpoint({
        type: 'tcp',
        host,
        port: socket.remotePort,
      });
      this._connectToPeer({ endpoint, socket });
    });
    this._tcpServer = tcpServer;
    tcpServer.on('error', error => {
      this.__onEvent({
        event: 'TCP_SERVER_ERROR',
        message: `TCP peer server encountered an error: $${error.message}`,
        data: { error },
      });
    });
    tcpServer.listen(listenTCP.port, listenTCP.host);

    this.__onEvent({
      event: 'TCP_SERVER_LISTEN',
      message: `Listening on ${listenTCP.host || '0.0.0.0'}:${listenTCP.port}.`,
    });
  }

  async _run(): Promise<void> {
    this.__onEvent({
      event: 'CONNECT_LOOP_START',
      message: 'Starting connect loop...',
    });
    while (!this._stopped) {
      try {
        // eslint-disable-next-line
        await this._connectToPeers();
        // eslint-disable-next-line
        await new Promise(resolve => {
          this._connectPeersTimeout = setTimeout(() => {
            this._connectPeersTimeout = null;
            resolve();
          }, this._connectPeersDelayMS);
        });
      } catch (error) {
        this.__onEvent({
          event: 'CONNECT_LOOP_ERROR',
          message: `Encountered error in connect loop: ${error.message}`,
          data: { error },
        });
      }
    }
  }

  async _connectToPeers(): Promise<void> {
    const connectedPeersCount = Object.keys(this._connectedPeers).length;
    if (connectedPeersCount < this._maxConnectedPeers) {
      const count = this._maxConnectedPeers - connectedPeersCount;
      const endpoints = [...this._unconnectedPeers].slice(0, count);

      if (endpoints.length !== count) {
        this.__onRequestEndpoints();
      }

      endpoints.push(...this._seeds);

      await Promise.all(
        endpoints.map(endpoint => this._connectToPeer({ endpoint })),
      );
    }
  }

  async _connectToPeer({
    endpoint,
    socket,
  }: {|
    endpoint: Endpoint,
    socket?: net.Socket,
  |}): Promise<void> {
    if (
      this._connectingPeers[endpoint] ||
      this._connectedPeers[endpoint] != null
    ) {
      return;
    }
    this._connectingPeers[endpoint] = true;

    this.__onEvent({
      event: 'PEER_CONNECT_START',
      message: `Connecting to peer at ${endpoint}`,
    });
    try {
      const endpointConfig = getEndpointConfig(endpoint);
      if (endpointConfig.type === 'tcp') {
        await this._startPeerConnection(this._createTCPPeer(endpoint, socket));
      } else {
        throw new UnsupportedEndpointType(endpoint);
      }
    } catch (error) {
      this.__onEvent({
        event: 'PEER_CONNECT_ERROR',
        message: `Failed to connect to peer at ${endpoint}: ${error.message}`,
        data: { error },
      });
    } finally {
      delete this._connectingPeers[endpoint];
    }
  }

  async _startPeerConnection(peer: Peer<Message>): Promise<void> {
    try {
      await peer.connect();
    } catch (error) {
      peer.close();
      this._unconnectedPeers.delete(peer.endpoint);
      throw error;
    }

    let data;
    let relay;
    try {
      const result = await this.__negotiate(peer);
      // eslint-disable-next-line
      data = result.data;
      // eslint-disable-next-line
      relay = result.relay;
    } catch (error) {
      peer.close();
      throw error;
    }

    if (peer.connected) {
      const connectedPeer = new ConnectedPeer({ peer, data, relay });
      this._connectedPeers[peer.endpoint] = connectedPeer;
      connectedPeer.peer.streamData(message =>
        this.__onMessageReceived(connectedPeer, message),
      );

      this.__onEvent({
        event: 'PEER_CONNECT_SUCCESS',
        message: `Connected to peer at ${peer.endpoint}`,
        extra: { connectedPeer },
      });
    }
  }

  _createTCPPeer(endpoint: Endpoint, socket?: net.Socket): TCPPeer<Message> {
    return new TCPPeer({
      endpoint,
      socket,
      transform: this.__createMessageTransform(),
      timeoutMS: this._socketTimeoutMS,
      onError: this._onError,
      onClose: this._onClose,
    });
  }

  _onError(peer: Peer<Message>, error: Error): void {
    peer.close();
    this.__onEvent({
      event: 'PEER_ERROR',
      message: `Encountered error with peer at ${peer.endpoint}: ${error.message}`,
      data: { error },
    });
  }

  _onClose(peer: Peer<Message>): void {
    const connectedPeer = this._connectedPeers[peer.endpoint];
    if (connectedPeer != null) {
      delete this._connectedPeers[peer.endpoint];
    }
    this.__onEvent({
      event: 'PEER_CLOSED',
      message: `Peer at ${peer.endpoint} closed.`,
      extra: { peer: connectedPeer || peer },
    });
  }
}
