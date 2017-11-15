/* @flow */
import {
  type ConnectedPeer,
  type EventMessage as NetworkEventMessage,
  type ListenTCP,
  type NegotiateResult,
  type Peer,
  Network,
} from 'neo-blockchain-network';
import {
  TRANSACTION_TYPE,
  type Block,
  type Header,
  type Transaction,
  type UInt256Hex,
  MerkleTree,
  RegisterTransaction,
  common,
  crypto,
  utils,
} from 'neo-blockchain-core';
import {
  type Blockchain,
  type Endpoint,
  type Node as INode,
  createEndpoint,
  getEndpointConfig,
} from 'neo-blockchain-node-core';
import BloomFilter from 'bloom-filter';
import { ScalingBloem } from 'bloem';

import _ from 'lodash';
import net from 'net';

import { COMMAND } from './Command';
import {
  INVENTORY_TYPE,
  SERVICES,
  AddrPayload,
  ConsensusPayload,
  FilterAddPayload,
  FilterLoadPayload,
  GetBlocksPayload,
  HeadersPayload,
  InvPayload,
  MerkleBlockPayload,
  NetworkAddress,
  VersionPayload,
} from './payload';
import Message, { type MessageValue, MessageTransform } from './Message';
import { NegotiationError } from './errors';
import { type PeerData } from './PeerData';

import pkg from '../package.json';

type NodeOptions = {|
  blockchain: Blockchain,
  seeds: Array<Endpoint>,
  listenTCP?: ListenTCP,
  externalEndpoints?: Array<Endpoint>,
  connectPeersDelayMS?: number,
  maxConnectedPeers?: number,
  socketTimeoutMS?: number,
|};

const createPeerBloomFilter = ({
  filter,
  k,
  tweak,
}: {
  filter: Buffer,
  k: number,
  tweak: number,
}) =>
  new BloomFilter({
    vData: Buffer.from(filter),
    nHashFuncs: k,
    nTweak: tweak,
  });

const createScalingBloomFilter = () =>
  new ScalingBloem(0.05, {
    initial_capacity: 100000,
    scaling: 4,
  });

const MEM_POOL_SIZE = 30000;
const GET_ADDR_PEER_COUNT = 200;
const GET_BLOCKS_COUNT = 500;
// Assume that we get 500 back, but if not, at least request every 10 seconds
const GET_BLOCKS_BUFFER = GET_BLOCKS_COUNT / 3;
const GET_BLOCKS_TIME_MS = 10000;
const GET_BLOCKS_THROTTLE_MS = 500;
const GET_BLOCKS_CLOSE_COUNT = 3;
const LOCAL_HOST_ADDRESSES = new Set(['0.0.0.0', 'localhost', '127.0.0.1']);

export default class Node implements INode {
  _blockchain: Blockchain;
  _network: Network<Message, PeerData>;

  _started: boolean;
  _stopped: boolean;

  _externalPort: number;
  _nonce: number;
  _userAgent: string;

  memPool: { [hash: UInt256Hex]: Transaction };
  _knownBlockHashes: ScalingBloem;
  _tempKnownBlockHashes: Set<UInt256Hex>;
  _knownTransactionHashes: ScalingBloem;
  _tempKnownTransactionHashes: Set<UInt256Hex>;
  _knownHeaderHashes: ScalingBloem;
  _tempKnownHeaderHashes: Set<UInt256Hex>;
  _fetchedIndex: number;
  _getBlocksRequestsIndex: ?number;
  _getBlocksRequestTime: ?number;
  _getBlocksRequestsCount: number;
  _bestPeer: ?ConnectedPeer<Message, PeerData>;

  constructor(options: NodeOptions) {
    this._blockchain = options.blockchain;
    this._network = new Network({
      seeds: options.seeds,
      listenTCP: options.listenTCP,
      externalEndpoints: options.externalEndpoints,
      connectPeersDelayMS: options.connectPeersDelayMS,
      maxConnectedPeers: options.maxConnectedPeers,
      socketTimeoutMS: options.socketTimeoutMS,
      negotiate: this._negotiate,
      createMessageTransform: () =>
        new MessageTransform(this._blockchain.deserializeWireContext),
      onMessageReceived: this._onMessageReceived.bind(this),
      onRequestEndpoints: this._onRequestEndpoints.bind(this),
      onEvent: this._onEvent,
    });

    this._started = false;
    this._stopped = false;

    this._externalPort = (options.listenTCP || {}).port || 0;
    this._nonce = Math.floor(Math.random() * utils.UINT_MAX_NUMBER);
    this._userAgent = `NEO:neo-blockchain-js:${pkg.version}`;

    this.memPool = {};
    this._knownBlockHashes = createScalingBloomFilter();
    this._tempKnownBlockHashes = new Set();
    this._knownTransactionHashes = createScalingBloomFilter();
    this._tempKnownTransactionHashes = new Set();
    this._knownHeaderHashes = createScalingBloomFilter();
    this._tempKnownHeaderHashes = new Set();
    this._getBlocksRequestsIndex = null;
    this._getBlocksRequestTime = null;
    this._getBlocksRequestsCount = 1;
  }

  get connectedPeersCount(): number {
    return this._network.connectedPeers.length;
  }

  start(): void {
    if (this._started) {
      return;
    }
    this._started = true;
    this._stopped = false;

    this._blockchain.log({ event: 'NODE_START' });
    try {
      this._network.start();
    } catch (error) {
      this._started = false;
      throw error;
    }
  }

  stop(): void {
    if (this._stopped) {
      return;
    }
    this._stopped = true;

    this._blockchain.log({ event: 'NODE_STOP' });
    try {
      this._network.stop();
      this._started = false;
    } catch (error) {
      this._stopped = false;
      throw error;
    }
  }

  async relayTransaction(transaction: Transaction): Promise<void> {
    if (
      transaction.type === TRANSACTION_TYPE.MINER ||
      this.memPool[transaction.hashHex] != null ||
      this._tempKnownTransactionHashes.has(transaction.hashHex)
    ) {
      return;
    }

    if (!this._knownTransactionHashes.has(transaction.hash)) {
      const hash = common.uInt256ToString(transaction.hash);
      this._blockchain.log({
        event: 'RELAY_TRANSACTION_START',
        level: 'debug',
        hash,
      });

      this._tempKnownTransactionHashes.add(transaction.hashHex);

      try {
        const foundTransaction = await this._blockchain.transaction.tryGet({
          hash: transaction.hash,
        });
        if (foundTransaction == null) {
          await this._blockchain.verifyTransaction({
            transaction,
            memPool: utils.values(this.memPool),
          });
          this.memPool[transaction.hashHex] = transaction;
          this._knownTransactionHashes.add(transaction.hash);
          this._relayTransaction(transaction);
          this._blockchain.log({
            event: 'RELAY_TRANSACTION_SUCCESS',
            level: 'debug',
            hash,
          });
          await this._trimMemPool();
        }
      } catch (error) {
        this._blockchain.log({ event: 'RELAY_TRANSACTION_ERROR', hash, error });

        throw error;
        // eslint-disable-next-line
      } finally {
        this._tempKnownTransactionHashes.delete(transaction.hashHex);
      }
    }
  }

  _relay(message: Message): void {
    this._blockchain.log({
      event: 'RELAY_MESSAGE',
      level: 'debug',
      command: message.value.command,
    });
    this._network.relay(message.serializeWire());
  }

  _relayTransaction(transaction: Transaction) {
    const message = this._createMessage({
      command: COMMAND.INV,
      payload: new InvPayload({
        type: INVENTORY_TYPE.TRANSACTION,
        hashes: [transaction.hash],
      }),
    });
    const messagePayload = message.serializeWire();
    for (const peer of this._network.connectedPeers) {
      if (peer.relay && this._testFilter(peer.data.bloomFilter, transaction)) {
        peer.write(messagePayload);
      }
    }
  }

  _sendMessage(
    peer: Peer<Message> | ConnectedPeer<Message, PeerData>,
    message: Message,
  ): void {
    this._blockchain.log({
      event: 'SEND_MESSAGE',
      level: 'debug',
      command: message.value.command,
      endpoint: peer.endpoint,
    });
    peer.write(message.serializeWire());
  }

  _negotiate = async (
    peer: Peer<Message>,
  ): Promise<NegotiateResult<PeerData>> => {
    this._sendMessage(
      peer,
      this._createMessage({
        command: COMMAND.VERSION,
        payload: new VersionPayload({
          protocolVersion: 0,
          services: SERVICES.NODE_NETWORK,
          timestamp: Math.round(Date.now() / 1000),
          port: this._externalPort,
          nonce: this._nonce,
          userAgent: this._userAgent,
          startHeight: this._blockchain.currentBlockIndex,
          relay: true,
        }),
      }),
    );

    const message = await peer.receiveMessage(30000);
    let versionPayload;
    if (message.value.command === COMMAND.VERSION) {
      versionPayload = message.value.payload;
    } else {
      throw new NegotiationError(message);
    }

    if (!this._checkVersion(versionPayload)) {
      throw new NegotiationError(message);
    }

    let address;
    const { host } = getEndpointConfig(peer.endpoint);
    if (net.isIPv4(host)) {
      address = new NetworkAddress({
        host,
        port: versionPayload.port,
        timestamp: versionPayload.timestamp,
        services: versionPayload.services,
      });
    }

    this._sendMessage(peer, this._createMessage({ command: COMMAND.VERACK }));

    const nextMessage = await peer.receiveMessage(30000);
    if (nextMessage.value.command !== COMMAND.VERACK) {
      throw new NegotiationError(nextMessage);
    }

    return {
      data: {
        nonce: versionPayload.nonce,
        startHeight: versionPayload.startHeight,
        bloomFilter: null,
        address,
      },
      relay: versionPayload.relay,
    };
  };

  _onEvent = (event: NetworkEventMessage<Message, PeerData>) => {
    if (event.event === 'PEER_CONNECT_SUCCESS') {
      const { connectedPeer } = event.extra;
      if (
        this._bestPeer == null ||
        this._bestPeer.data.startHeight < connectedPeer.data.startHeight
      ) {
        this._bestPeer = connectedPeer;
        this._requestBlocks();
      }
    } else if (event.event === 'PEER_CLOSED') {
      if (
        this._bestPeer != null &&
        this._bestPeer.endpoint === event.extra.peer.endpoint
      ) {
        this._bestPeer = this._findBestPeer();
        this._requestBlocks();
      }
    }

    this._blockchain.log({
      event: event.event,
      ...(event.data || {}),
    });
  };

  _findBestPeer(): ConnectedPeer<Message, PeerData> {
    return _.maxBy(this._network.connectedPeers, peer => peer.data.startHeight);
  }

  _requestBlocks = _.debounce(() => {
    const peer = this._bestPeer;
    const block = this._blockchain.currentBlock;
    if (peer != null && block.index < peer.data.startHeight) {
      if (this._getBlocksRequestsCount > GET_BLOCKS_CLOSE_COUNT) {
        this._blockchain.log({
          event: 'REQUEST_BLOCKS_CLOSE_PEER',
          level: 'debug',
          peer: peer.endpoint,
        });
        peer.close();
        this._getBlocksRequestsCount = 0;
      } else if (this._shouldRequestBlocks()) {
        if (this._getBlocksRequestsIndex === block.index) {
          this._blockchain.log({
            event: 'REQUEST_BLOCKS_REPEAT_REQUEST',
            level: 'debug',
            peer: peer.endpoint,
            index: block.index,
          });
          this._getBlocksRequestsCount += 1;
        } else {
          this._blockchain.log({
            event: 'REQUEST_BLOCKS_INITIAL_REQUEST',
            level: 'debug',
            peer: peer.endpoint,
            index: block.index,
          });
          this._getBlocksRequestsCount = 1;
          this._getBlocksRequestsIndex = block.index;
        }
        this._getBlocksRequestTime = Date.now();
        this._sendMessage(
          peer,
          this._createMessage({
            command: COMMAND.GET_BLOCKS,
            payload: new GetBlocksPayload({
              hashStart: [block.hash],
            }),
          }),
        );
      } else {
        this._blockchain.log({
          event: 'REQUEST_BLOCKS_SKIP_REQUEST',
          level: 'debug',
          peer: peer.endpoint,
          index: block.index,
        });
      }

      this._requestBlocks();
    }
  }, GET_BLOCKS_THROTTLE_MS);

  _shouldRequestBlocks(): boolean {
    const block = this._blockchain.currentBlock;
    const getBlocksRequestTime = this._getBlocksRequestTime;
    return (
      this._getBlocksRequestsIndex == null ||
      block.index - this._getBlocksRequestsIndex > GET_BLOCKS_BUFFER ||
      getBlocksRequestTime == null ||
      Date.now() - getBlocksRequestTime > GET_BLOCKS_TIME_MS
    );
  }

  _checkVersion(version: VersionPayload): boolean {
    if (version.nonce === this._nonce) {
      return false;
    }

    if (
      this._network.connectedPeers.some(
        peer => version.nonce === peer.data.nonce,
      )
    ) {
      return false;
    }

    return true;
  }

  _ready(): boolean {
    const peer = this._bestPeer;
    const block = this._blockchain.currentBlock;
    return peer != null && block.index >= peer.data.startHeight;
  }

  _onRequestEndpoints = (): void => {
    this._relay(this._createMessage({ command: COMMAND.GET_ADDR }));
  };

  _onMessageReceived(
    peer: ConnectedPeer<Message, PeerData>,
    message: Message,
  ): void {
    this._blockchain.log({
      event: 'MESSAGE_RECEIVED',
      level: 'debug',
      endpoint: peer.endpoint,
      command: message.value.command,
    });

    const onError = (error: Error) => {
      this._blockchain.log({
        event: 'MESSAGE_RECEIVED_ERROR',
        error,
        endpoint: peer.endpoint,
        command: message.value.command,
      });
    };

    try {
      switch (message.value.command) {
        case COMMAND.ADDR:
          this._onAddrMessageReceived(message.value.payload);
          break;
        case COMMAND.BLOCK:
          this._onBlockMessageReceived(message.value.payload).catch(onError);
          break;
        case COMMAND.CONSENSUS:
          this._onConsensusMessageReceived(message.value.payload);
          break;
        case COMMAND.FILTER_ADD:
          this._onFilterAddMessageReceived(peer, message.value.payload);
          break;
        case COMMAND.FILTER_CLEAR:
          this._onFilterClearMessageReceived(peer);
          break;
        case COMMAND.FILTER_LOAD:
          this._onFilterLoadMessageReceived(peer, message.value.payload);
          break;
        case COMMAND.GET_ADDR:
          this._onGetAddrMessageReceived(peer);
          break;
        case COMMAND.GET_BLOCKS:
          this._onGetBlocksMessageReceived(peer, message.value.payload).catch(
            onError,
          );
          break;
        case COMMAND.GET_DATA:
          this._onGetDataMessageReceived(peer, message.value.payload).catch(
            onError,
          );
          break;
        case COMMAND.GET_HEADERS:
          this._onGetHeadersMessageReceived(peer, message.value.payload).catch(
            onError,
          );
          break;
        case COMMAND.HEADERS:
          this._onHeadersMessageReceived(peer, message.value.payload).catch(
            onError,
          );
          break;
        case COMMAND.INV:
          this._onInvMessageReceived(peer, message.value.payload);
          break;
        case COMMAND.MEMPOOL:
          this._onMemPoolMessageReceived(peer);
          break;
        case COMMAND.TX:
          this._onTransactionReceived(message.value.payload).catch(onError);
          break;
        case COMMAND.VERACK:
          this._onVerackMessageReceived(peer);
          break;
        case COMMAND.VERSION:
          this._onVersionMessageReceived(peer);
          break;
        case COMMAND.ALERT:
          break;
        case COMMAND.MERKLE_BLOCK:
          break;
        case COMMAND.NOT_FOUND:
          break;
        case COMMAND.PING:
          break;
        case COMMAND.PONG:
          break;
        case COMMAND.REJECT:
          break;
        default:
          // eslint-disable-next-line
          (message.value.command: empty);
          break;
      }
    } catch (error) {
      onError(error);
    }
  }

  _onAddrMessageReceived(addr: AddrPayload): void {
    addr.addresses
      .filter(address => !LOCAL_HOST_ADDRESSES.has(address.host))
      .map(address =>
        createEndpoint({
          type: 'tcp',
          host: address.host,
          port: address.port,
        }),
      )
      .forEach(endpoint => this._network.addEndpoint(endpoint));
  }

  async _onBlockMessageReceived(block: Block): Promise<void> {
    this._blockchain.log({
      event: 'BLOCK_RECEIVED',
      level: 'debug',
      index: block.index,
    });
    if (
      this._blockchain.currentBlockIndex >= block.index ||
      this._tempKnownBlockHashes.has(block.hashHex)
    ) {
      return;
    }

    if (!this._knownBlockHashes.has(block.hash)) {
      this._tempKnownBlockHashes.add(block.hashHex);

      try {
        const foundBlock = await this._blockchain.block.tryGet({
          hashOrIndex: block.hash,
        });
        if (foundBlock == null) {
          this._blockchain.log({
            event: 'NODE_PERSIST_BLOCK',
            level: 'debug',
            index: block.index,
          });
          await this._blockchain.persistBlock({ block });

          const peer = this._bestPeer;
          if (peer != null && block.index > peer.data.startHeight) {
            this._relay(
              this._createMessage({
                command: COMMAND.INV,
                payload: new InvPayload({
                  type: INVENTORY_TYPE.BLOCK,
                  hashes: [block.hash],
                }),
              }),
            );
          }
        }

        this._knownBlockHashes.add(block.hash);
        this._knownHeaderHashes.add(block.hash);
        for (const transaction of block.transactions) {
          delete this.memPool[transaction.hashHex];
          this._knownTransactionHashes.add(transaction.hash);
        }
      } finally {
        this._tempKnownBlockHashes.delete(block.hashHex);
      }
    }
  }

  // TODO: Implement
  // eslint-disable-next-line
  _onConsensusMessageReceived(consensus: ConsensusPayload): void {}

  // eslint-disable-next-line
  _onFilterAddMessageReceived(
    peer: ConnectedPeer<Message, PeerData>,
    filterAdd: FilterAddPayload,
  ): void {
    if (peer.data.bloomFilter != null) {
      peer.data.bloomFilter.insert(filterAdd.data);
    }
  }

  // eslint-disable-next-line
  _onFilterClearMessageReceived(peer: ConnectedPeer<Message, PeerData>): void {
    // eslint-disable-next-line
    peer.data.bloomFilter = null;
  }

  // eslint-disable-next-line
  _onFilterLoadMessageReceived(
    peer: ConnectedPeer<Message, PeerData>,
    filterLoad: FilterLoadPayload,
  ): void {
    // eslint-disable-next-line
    peer.data.bloomFilter = createPeerBloomFilter(filterLoad);
  }

  _onGetAddrMessageReceived(peer: ConnectedPeer<Message, PeerData>): void {
    const addresses = _.take(
      _.shuffle(
        this._network.connectedPeers
          .map(connectedPeer => connectedPeer.data.address)
          .filter(Boolean),
      ),
      GET_ADDR_PEER_COUNT,
    );
    if (addresses.length > 0) {
      this._sendMessage(
        peer,
        this._createMessage({
          command: COMMAND.ADDR,
          payload: new AddrPayload({ addresses }),
        }),
      );
    }
  }

  async _onGetBlocksMessageReceived(
    peer: ConnectedPeer<Message, PeerData>,
    getBlocks: GetBlocksPayload,
  ): Promise<void> {
    const headers = await this._getHeaders(
      getBlocks,
      this._blockchain.currentBlockIndex,
    );
    this._sendMessage(
      peer,
      this._createMessage({
        command: COMMAND.INV,
        payload: new InvPayload({
          type: INVENTORY_TYPE.BLOCK,
          hashes: headers.map(header => header.hash),
        }),
      }),
    );
  }

  async _onGetDataMessageReceived(
    peer: ConnectedPeer<Message, PeerData>,
    getData: InvPayload,
  ): Promise<void> {
    switch (getData.type) {
      case 0x01: // Transaction
        await Promise.all(
          getData.hashes.map(async hash => {
            let transaction = this.memPool[common.uInt256ToHex(hash)];
            if (transaction == null) {
              transaction = await this._blockchain.transaction.tryGet({ hash });
            }

            if (transaction != null) {
              this._sendMessage(
                peer,
                this._createMessage({
                  command: COMMAND.TX,
                  payload: transaction,
                }),
              );
            }
          }),
        );
        break;
      case 0x02: // Block
        await Promise.all(
          getData.hashes.map(async hash => {
            const block = await this._blockchain.block.tryGet({
              hashOrIndex: hash,
            });
            if (block != null) {
              if (peer.data.bloomFilter == null) {
                this._sendMessage(
                  peer,
                  this._createMessage({
                    command: COMMAND.BLOCK,
                    payload: block,
                  }),
                );
              } else {
                this._sendMessage(
                  peer,
                  this._createMessage({
                    command: COMMAND.MERKLE_BLOCK,
                    payload: this._createMerkleBlockPayload({
                      block,
                      flags: block.transactions.map(transaction =>
                        this._testFilter(peer.data.bloomFilter, transaction),
                      ),
                    }),
                  }),
                );
              }
            }
          }),
        );
        break;
      case 0xe0: // Consensus
        // TODO: Implement
        break;
      default:
        // eslint-disable-next-line
        (getData.type: empty);
        break;
    }
  }

  async _onGetHeadersMessageReceived(
    peer: ConnectedPeer<Message, PeerData>,
    getBlocks: GetBlocksPayload,
  ): Promise<void> {
    const headers = await this._getHeaders(
      getBlocks,
      this._blockchain.currentHeader.index,
    );
    this._sendMessage(
      peer,
      this._createMessage({
        command: COMMAND.HEADERS,
        payload: new HeadersPayload({ headers }),
      }),
    );
  }

  async _onHeadersMessageReceived(
    peer: ConnectedPeer<Message, PeerData>,
    headersPayload: HeadersPayload,
  ): Promise<void> {
    const headers = headersPayload.headers.filter(
      header =>
        !this._knownHeaderHashes.has(header.hash) &&
        !this._tempKnownHeaderHashes.has(header.hashHex),
    );
    if (headers.length > 0) {
      for (const header of headers) {
        this._tempKnownHeaderHashes.add(header.hashHex);
      }
      try {
        await this._blockchain.persistHeaders(headers);
        for (const header of headers) {
          this._knownHeaderHashes.add(header.hash);
        }
      } finally {
        for (const header of headers) {
          this._tempKnownHeaderHashes.delete(header.hashHex);
        }
      }
    }

    if (this._blockchain.currentHeader.index < peer.data.startHeight) {
      this._sendMessage(
        peer,
        this._createMessage({
          command: COMMAND.GET_HEADERS,
          payload: new GetBlocksPayload({
            hashStart: [this._blockchain.currentHeader.hash],
          }),
        }),
      );
    }
  }

  _onInvMessageReceived(
    peer: ConnectedPeer<Message, PeerData>,
    inv: InvPayload,
  ): void {
    let hashes;
    switch (inv.type) {
      case 0x01: // Transaction
        hashes = inv.hashes.filter(
          hash =>
            !this._knownTransactionHashes.has(hash) &&
            !this._tempKnownTransactionHashes.has(common.uInt256ToHex(hash)),
        );
        break;
      case 0x02: // Block
        hashes = inv.hashes.filter(
          hash =>
            !this._knownBlockHashes.has(hash) &&
            !this._tempKnownBlockHashes.has(common.uInt256ToHex(hash)),
        );
        break;
      case 0xe0: // Consensus
        // TODO: Implement
        hashes = [];
        break;
      default:
        // eslint-disable-next-line
        (inv.type: empty);
        hashes = [];
        break;
    }

    if (hashes.length > 0) {
      this._sendMessage(
        peer,
        this._createMessage({
          command: COMMAND.GET_DATA,
          payload: new InvPayload({ type: inv.type, hashes }),
        }),
      );
    }
  }

  _onMemPoolMessageReceived(peer: ConnectedPeer<Message, PeerData>): void {
    this._sendMessage(
      peer,
      this._createMessage({
        command: COMMAND.INV,
        payload: new InvPayload({
          type: INVENTORY_TYPE.TRANSACTION,
          hashes: utils
            .values(this.memPool)
            .map(transaction => transaction.hash),
        }),
      }),
    );
  }

  async _onTransactionReceived(transaction: Transaction): Promise<void> {
    if (this._ready()) {
      await this.relayTransaction(transaction);
    }
  }

  // eslint-disable-next-line
  _onVerackMessageReceived(peer: ConnectedPeer<Message, PeerData>): void {
    peer.close();
  }

  // eslint-disable-next-line
  _onVersionMessageReceived(peer: ConnectedPeer<Message, PeerData>): void {
    peer.close();
  }

  async _getHeaders(
    getBlocks: GetBlocksPayload,
    maxHeight: number,
  ): Promise<Array<Header>> {
    let hashStopIndexPromise = Promise.resolve(maxHeight);
    if (getBlocks.hashStop !== 0) {
      hashStopIndexPromise = this._blockchain.header
        .tryGet({ hashOrIndex: getBlocks.hashStop })
        .then(
          hashStopHeader =>
            hashStopHeader == null
              ? maxHeight
              : Math.min(hashStopHeader.index, maxHeight),
        );
    }
    const [hashStartHeaders, hashEnd] = await Promise.all([
      Promise.all(
        getBlocks.hashStart.map(hash =>
          this._blockchain.header.tryGet({ hashOrIndex: hash }),
        ),
      ),
      hashStopIndexPromise,
    ]);
    const hashStartHeader = _.head(
      _.orderBy(hashStartHeaders.filter(Boolean), [header => header.index]),
    );
    if (hashStartHeader == null) {
      return [];
    }
    const hashStart = hashStartHeader.index + 1;
    if (hashStart > maxHeight) {
      return [];
    }

    const headers = await Promise.all(
      _.range(hashStart, Math.min(hashStart + GET_BLOCKS_COUNT, hashEnd)).map(
        index => this._blockchain.header.get({ hashOrIndex: index }),
      ),
    );

    return headers;
  }

  async _trimMemPool(): Promise<void> {
    const memPool = utils.values(this.memPool);
    if (memPool.length > MEM_POOL_SIZE) {
      const transactionAndFee = await Promise.all(
        memPool.map(async transaction => {
          const networkFee = await transaction.getNetworkFee({
            getOutput: this._blockchain.output.get,
            governingToken: this._blockchain.settings.governingToken,
            utilityToken: this._blockchain.settings.utilityToken,
            fees: this._blockchain.settings.fees,
          });
          return [transaction, networkFee];
        }),
      );
      const hashesToRemove = _.take(
        _.sortBy(
          transactionAndFee,
          // TODO: Might be a bug since we're converting to number
          ([transaction, networkFee]) =>
            networkFee.divn(transaction.size).toNumber(),
        ),
        // eslint-disable-next-line
      ).map(([transaction, _]) => transaction.hashHex);
      for (const hash of hashesToRemove) {
        delete this.memPool[hash];
      }
    }
  }

  _testFilter(bloomFilterIn: ?BloomFilter, transaction: Transaction): boolean {
    const bloomFilter = bloomFilterIn;
    if (bloomFilter == null) {
      return true;
    }
    return (
      bloomFilter.contains(transaction.hash) ||
      transaction.outputs.some(output =>
        bloomFilter.contains(output.address),
      ) ||
      transaction.inputs.some(input =>
        bloomFilter.contains(input.serializeWire()),
      ) ||
      transaction.scripts.some(script =>
        bloomFilter.contains(crypto.toScriptHash(script.verification)),
      ) ||
      (transaction.type === TRANSACTION_TYPE.REGISTER &&
        transaction instanceof RegisterTransaction &&
        bloomFilter.contains(transaction.asset.admin))
    );
  }

  _createMerkleBlockPayload({
    block,
    flags,
  }: {|
    block: Block,
    flags: Array<boolean>,
  |}): MerkleBlockPayload {
    const tree = new MerkleTree(
      block.transactions.map(transaction => transaction.hash),
    ).trim(flags);

    const buffer = Buffer.allocUnsafe(Math.floor((flags.length + 7) / 8));
    for (let i = 0; i < flags.length; i += 1) {
      if (flags[i]) {
        // eslint-disable-next-line
        buffer[Math.floor(i / 8)] |= 1 << (i % 8);
      }
    }

    return new MerkleBlockPayload({
      version: block.version,
      previousHash: block.previousHash,
      merkleRoot: block.merkleRoot,
      timestamp: block.timestamp,
      index: block.index,
      consensusData: block.consensusData,
      nextConsensus: block.nextConsensus,
      script: block.script,
      transactionCount: block.transactions.length,
      hashes: tree.toHashArray(),
      flags: buffer,
    });
  }

  _createMessage(value: MessageValue): Message {
    return new Message({
      magic: this._blockchain.settings.messageMagic,
      value,
    });
  }
}
