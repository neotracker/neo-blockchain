/* @flow */
import type BN from 'bn.js';

import {
  SCRIPT_CONTAINER_TYPE,
  type Block,
  type ECPoint,
  type Header,
  type Input,
  type InvocationResult,
  type Output,
  type OutputKey,
  type SerializableInvocationData,
  type Transaction,
  type VerifyScriptOptions,
  InvocationTransaction,
  InvocationResultError,
  InvocationResultSuccess,
  common,
  crypto,
  utils,
} from 'neo-blockchain-core';
import {
  NULL_ACTION,
  TRIGGER_TYPE,
  type Blockchain as BlockchainType,
  type Logger,
  type LoggingContext,
  type OnStepInput,
  type Storage,
  type VM,
} from 'neo-blockchain-node-core';
import PriorityQueue from 'js-priority-queue'

import _ from 'lodash';
// TODO: Support in browsers?
// $FlowFixMe
import { performance } from 'perf_hooks'; // eslint-disable-line

import {
  GenesisBlockNotRegisteredError,
  VerifyError,
  WitnessVerifyError,
} from './errors';
import WriteBatchBlockchain from './WriteBatchBlockchain';

export type CreateBlockchainOptions = {|
  settings: $PropertyType<BlockchainType, 'settings'>,
  storage: Storage,
  vm: VM,
  logger: Logger,
  identifier: string,
|};

export type BlockchainOptions = {|
  ...CreateBlockchainOptions,
  currentBlock: ?$PropertyType<BlockchainType, 'currentBlock'>,
  currentHeader: ?$PropertyType<BlockchainType, 'currentHeader'>,
|};

type SpentCoin = {|
  output: Output,
  startHeight: number,
  endHeight: number,
  claimed: boolean,
|};

type Vote = {|
  publicKeys: Array<ECPoint>,
  count: BN,
|};

export default class Blockchain {
  settings: $PropertyType<BlockchainType, 'settings'>;
  logger: $PropertyType<BlockchainType, 'logger'>;
  identifier: $PropertyType<BlockchainType, 'identifier'>;
  deserializeWireContext: $PropertyType<BlockchainType, 'deserializeWireContext'>;
  serializeJSONContext: $PropertyType<BlockchainType, 'serializeJSONContext'>;

  currentBlock: $PropertyType<BlockchainType, 'currentBlock'>;
  currentHeader: $PropertyType<BlockchainType, 'currentHeader'>;
  currentBlockIndex: $PropertyType<BlockchainType, 'currentBlockIndex'>;

  account: $PropertyType<BlockchainType, 'account'>;
  action: $PropertyType<BlockchainType, 'action'>;
  asset: $PropertyType<BlockchainType, 'asset'>;
  block: $PropertyType<BlockchainType, 'block'>;
  blockSystemFee: $PropertyType<BlockchainType, 'blockSystemFee'>;
  header: $PropertyType<BlockchainType, 'header'>;
  transaction: $PropertyType<BlockchainType, 'transaction'>;
  transactionSpentCoins: $PropertyType<BlockchainType, 'transactionSpentCoins'>;
  output: $PropertyType<BlockchainType, 'output'>;
  contract: $PropertyType<BlockchainType, 'contract'>;
  storageItem: $PropertyType<BlockchainType, 'storageItem'>;
  validator: $PropertyType<BlockchainType, 'validator'>;
  invocationData: $PropertyType<BlockchainType, 'invocationData'>;

  _storage: Storage;
  _currentBlock: ?$PropertyType<BlockchainType, 'currentBlock'>;
  _currentHeader: ?$PropertyType<BlockchainType, 'currentHeader'>;
  _persistingBlocks: boolean;
  _blockQueue: PriorityQueue;
  _inQueue: Set<number>;
  _vm: VM;
  _loggingContext: LoggingContext;

  constructor(options: BlockchainOptions) {
    this._storage = options.storage;
    this._currentBlock = options.currentBlock;
    this._currentHeader = options.currentHeader;
    this._persistingBlocks = false;
    this._blockQueue = new PriorityQueue({
      comparator: (a, b) => a.block.index - b.block.index,
    });
    this._inQueue = new Set();
    this._vm = options.vm;
    this._loggingContext = {
      type: 'blockchain',
      identifier: options.identifier,
    };

    this.settings = options.settings;
    this.logger = options.logger;
    this.identifier = options.identifier;

    this.account = this._storage.account;
    this.action = this._storage.action;
    this.asset = this._storage.asset;
    this.block = {
      get: this._storage.block.get,
      tryGet: this._storage.block.tryGet,
    };
    this.blockSystemFee = this._storage.blockSystemFee;
    this.header = {
      get: this._storage.header.get,
      tryGet: this._storage.header.tryGet,
    };
    this.transaction = this._storage.transaction;
    this.transactionSpentCoins = this._storage.transactionSpentCoins;
    this.output = this._storage.output;
    this.contract = this._storage.contract;
    this.storageItem = this._storage.storageItem;
    this.validator = this._storage.validator;
    this.invocationData = this._storage.invocationData;

    this.deserializeWireContext = {
      messageMagic: this.settings.messageMagic,
    };
    this.serializeJSONContext = {
      addressVersion: this.settings.addressVersion,
      feeContext: {
        getOutput: this.output.get,
        governingToken: this.settings.governingToken,
        utilityToken: this.settings.utilityToken,
        fees: this.settings.fees,
      },
      getInvocationData: this._getInvocationData,
    };
  }

  static async create({
    settings,
    storage,
    vm,
    logger,
    identifier,
  }: CreateBlockchainOptions): Promise<BlockchainType> {
    const [currentBlock, currentHeader] = await Promise.all([
      storage.block.tryGetLatest(),
      storage.header.tryGetLatest(),
    ]);

    const blockchain = new Blockchain({
      currentBlock,
      currentHeader,
      settings,
      storage,
      vm,
      logger,
      identifier,
    });

    if (currentHeader == null) {
      await blockchain.persistHeaders([settings.genesisBlock.header]);
    }

    if (currentBlock == null) {
      await blockchain.persistBlock({ block: settings.genesisBlock });
    }

    return blockchain;
  }

  get currentBlock(): Block {
    if (this._currentBlock == null) {
      throw new GenesisBlockNotRegisteredError();
    }

    return this._currentBlock;
  }

  get currentHeader(): Header {
    if (this._currentHeader == null) {
      throw new GenesisBlockNotRegisteredError();
    }

    return this._currentHeader;
  }

  get currentBlockIndex(): number {
    return this._currentBlock == null ? -1 : this._currentBlock.index;
  }

  persistBlock({
    block,
    unsafe,
  }: {|
    block: Block,
    unsafe?: boolean,
  |}): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this._inQueue.has(block.index)) {
        return;
      }
      this._inQueue.add(block.index);

      this._blockQueue.queue({ block, resolve, reject, unsafe });
      this._persistBlocksAsync();
    })
  };

  // eslint-disable-next-line
  async persistHeaders(headers: Array<Header>): Promise<void> {
    // TODO: Perhaps don't implement this?
  }

  async verifyBlock(block: Block): Promise<void> {
    await block.verify({
      genesisBlock: this.settings.genesisBlock,
      tryGetBlock: this.block.tryGet,
      tryGetHeader: this.header.tryGet,
      isSpent: this._isSpent,
      getAsset: this.asset.get,
      getOutput: this.output.get,
      getValidators: this._getValidators,
      calculateClaimAmount: this.calculateClaimAmount,
      verifyScript: this._verifyScript,
      currentHeight: this._currentBlock == null ? 0 : this._currentBlock.index,
      governingToken: this.settings.governingToken,
      utilityToken: this.settings.utilityToken,
      fees: this.settings.fees,
    });
  }

  async verifyTransaction({
    transaction,
    memPool,
  }: {
    transaction: Transaction,
    memPool?: Array<Transaction>,
  }): Promise<void> {
    await transaction.verify({
      calculateClaimAmount: this.calculateClaimAmount,
      isSpent: this._isSpent,
      getAsset: this.asset.get,
      getOutput: this.output.get,
      verifyScript: this._verifyScript,
      governingToken: this.settings.governingToken,
      utilityToken: this.settings.utilityToken,
      fees: this.settings.fees,
      currentHeight: this.currentBlockIndex,
      memPool,
    })
  }

  async invokeScript(script: Buffer): Promise<InvocationResult> {
    const blockchain = this._createWriteBlockchain();
    const transaction = new InvocationTransaction({
      script,
      gas: common.ONE_HUNDRED_FIXED8,
    });
    try {
      const result = await this._vm.executeScripts({
        scripts: [{ code: script }],
        blockchain,
        scriptContainer: {
          type: SCRIPT_CONTAINER_TYPE.TRANSACTION,
          value: transaction,
        },
        triggerType: TRIGGER_TYPE.APPLICATION,
        action: NULL_ACTION,
        gas: transaction.gas,
        onStep: this._onStep,
      });
      return new InvocationResultSuccess({
        stack: result.stack,
        stackAlt: result.stackAlt,
      });
    } catch (error) {
      return new InvocationResultError({ message: error.message })
    }
  }

  async _persistBlocksAsync(): Promise<void> {
    if (this._persistingBlocks) {
      return;
    }

    this._persistingBlocks = true;
    let entry;
    try {
      this.cleanBlockQueue();
      entry = this.peekBlockQueue();
      while (
        entry != null &&
        entry.block.index === this.currentBlockIndex + 1
      ) {
        entry = this._blockQueue.dequeue();
        const start = performance.now();
        // eslint-disable-next-line
        await this._persistBlock(entry.block, entry.unsafe);
        entry.resolve();
        const duration = performance.now() - start;
        this.logger({
          event: 'PERSIST_BLOCK_SUCCESS',
          message:
            `Persisted block at index ${entry.block.index} in ` +
            `${duration} ms.`,
          meta: { type: 'extra', block: entry.block, duration },
          context: this._loggingContext,
        });

        this.cleanBlockQueue();
        entry = this.peekBlockQueue();
      }
    } catch (error) {
      let message = 'Failed to persist block';
      if (entry != null) {
        message = `${message} at index ${entry.block.index}`;
        entry.reject(error);
      }
      this.logger({
        event: 'PERSIST_BLOCK_ERROR',
        message: `${message}: ${error.message}`,
        meta: {
          type: 'error',
          error,
          extra: { block: entry == null ? null : entry.block.index },
        },
        context: this._loggingContext,
      });
    } finally {
      this._persistingBlocks = false;
    }
  }

  cleanBlockQueue(): void {
    let entry = this.peekBlockQueue();
    while (
      entry != null &&
      entry.block.index <= this.currentBlockIndex
    ) {
      this._blockQueue.dequeue();
      entry.resolve();
      entry = this.peekBlockQueue();
    }
  }

  peekBlockQueue(): ?{
    block: Block,
    resolve: () => void,
    reject: (error: Error) => void,
    unsafe?: boolean,
  } {
    if (this._blockQueue.length > 0) {
      return this._blockQueue.peek();
    }

    return null;
  }

  async _persistBlock(block: Block, unsafe?: boolean): Promise<void> {
    if (!unsafe) {
      // TODO: Enable
      // await this.verifyBlock(block);
    }

    const blockchain = this._createWriteBlockchain();
    await blockchain.persistBlock(block);
    await this._storage.commit(blockchain.getChangeSet());
    this._currentBlock = block;
    this._currentHeader = block.header;
  };

  _verifyScript = async ({
    scriptContainer,
    hash,
    witness,
  }: VerifyScriptOptions): Promise<void> => {
    if (!common.uInt160Equal(
      hash,
      crypto.toScriptHash(witness.verification),
    )) {
      throw new WitnessVerifyError();
    }

    const blockchain = this._createWriteBlockchain();
    const result = await this._vm.executeScripts({
      scripts: [
        { code: witness.invocation, pushOnly: true },
        { code: witness.verification },
      ],
      blockchain,
      scriptContainer,
      triggerType: TRIGGER_TYPE.VERIFICATION,
      action: NULL_ACTION,
      gas: utils.ZERO,
      onStep: this._onStep,
    });

    if (blockchain.getChangeSet().length !== 0) {
      throw new VerifyError();
    }

    const stack = result.stack;
    if (stack.length !== 1) {
      throw new VerifyError();
    }

    const top = stack[0];
    if (!top.asBoolean()) {
      throw new VerifyError();
    }
  }

  calculateClaimAmount = async (
    claims: Array<Input>,
  ): Promise<BN> => {
    const spentCoins = await Promise.all(claims.map(
      claim => this._tryGetSpentCoin(claim),
    ));
    const filteredSpentCoins = spentCoins.filter(Boolean);
    if (spentCoins.length !== filteredSpentCoins.length) {
      // TODO: Better error
      throw new Error('Not all coins were spent');
    }

    if (filteredSpentCoins.some(coin => coin.claimed)) {
      // TODO: Better error
      throw new Error('Coin was already claimed');
    }

    if (filteredSpentCoins.some(coin => !common.uInt256Equal(
      coin.output.asset,
      this.settings.governingToken.hash,
    ))) {
      // TODO: Better error
      throw new Error('Invalid claim');
    }

    return utils.calculateClaimAmount({
      coins: filteredSpentCoins.map(coin => ({
        value: coin.output.value,
        startHeight: coin.startHeight,
        endHeight: coin.endHeight,
      })),
      decrementInterval: this.settings.decrementInterval,
      generationAmount: this.settings.generationAmount,
      getSystemFee: async (index) => {
        const header = await this._storage.header.get({ hashOrIndex: index });
        const blockSystemFee =
          await this._storage.blockSystemFee.get({ hash: header.hash });
        return blockSystemFee.systemFee;
      },
    });
  };

  _isSpent = async (input: OutputKey): Promise<boolean> => {
    const transactionSpentCoins =
      await this.transactionSpentCoins.tryGet({ hash: input.hash });

    return (
      transactionSpentCoins != null &&
      transactionSpentCoins.endHeights[input.index] != null
    );
  }

  _tryGetSpentCoin = async (input: Input): Promise<?SpentCoin> => {
    const [transactionSpentCoins, output] = await Promise.all([
      this.transactionSpentCoins.tryGet({ hash: input.hash }),
      this.output.get(input),
    ]);
    if (transactionSpentCoins == null) {
      return null;
    }

    const endHeight = transactionSpentCoins.endHeights[input.index];
    if (endHeight == null) {
      return null;
    }

    const claimed = transactionSpentCoins.claimed[input.index];

    return {
      output,
      startHeight: transactionSpentCoins.startHeight,
      endHeight,
      claimed: !!claimed,
    };
  }

  _getValidators = async (
    transactions: Array<Transaction>,
  ): Promise<Array<ECPoint>> => {
    const [votes, validators] = await Promise.all([
      this._getVotes(transactions),
      this.validator.all.toArray().toPromise(),
    ]);
    const sortedVotes = _.sortBy(votes, vote => vote.publicKeys.length);
    const validatorsCount = Math.max(
      utils.weightedAverage(
        utils.weightedFilter(
          sortedVotes,
          0.25,
          0.75,
          vote => vote.count.toNumber(),
        ).map(([vote, weight]) => ({
          value: vote.publicKeys.length,
          weight,
        })),
      ),
      this.settings.standbyValidators.length,
    );

    const validatorsToCount = _.fromPairs(validators.map(
      (validator) => [
        common.ecPointToHex(validator.publicKey),
        utils.ZERO,
      ],
    ));
    for (const vote of votes) {
      for (const publicKey of _.take(vote.publicKeys, validatorsCount)) {
        const publicKeyHex = common.ecPointToHex(publicKey);
        if (validatorsToCount[publicKeyHex] != null) {
          validatorsToCount[publicKeyHex] =
            validatorsToCount[publicKeyHex].add(vote.count);
        }
      }
    }

    return _.take(
      utils.entries(validatorsToCount)
        .sort(([aKey, aValue], [bKey, bValue]) =>
          aValue.eq(bValue)
            ? common.ecPointCompare(aKey, bKey)
            : -aValue.cmp(bValue)
        )
        // eslint-disable-next-line
        .map(([key, _]) => common.hexToECPoint(key)),
      validatorsCount,
    );
  }

  _getVotes = async (
    transactions: Array<Transaction>,
  ): Promise<Array<Vote>> => {
    const inputs = await Promise.all(
      transactions.map(transaction => transaction.getReferences({
        getOutput: this.output.get,
      })),
    ).then(results => results.reduce(
      (acc, inputResults) => acc.concat(inputResults),
      [],
    ).map(output => ({
      address: output.address,
      asset: output.asset,
      value: output.value.neg(),
    })));
    const outputs = transactions.reduce(
      (acc, transaction) => acc.concat(transaction.outputs),
      [],
    ).map(output => ({
      address: output.address,
      asset: output.asset,
      value: output.value,
    }));
    const changes = _.fromPairs(utils.entries(_.groupBy(
      inputs.concat(outputs)
        .filter(output => common.uInt256Equal(
          output.asset,
          this.settings.governingToken.hash,
        )),
      (output) => common.uInt160ToHex(output.address),
      // eslint-disable-next-line
    )).map(([addressHex, addressOutputs]) => [
      addressHex,
      addressOutputs.reduce(
        (acc, output) => acc.add(output.value),
        utils.ZERO,
      ),
    ]));
    const votes = await this.account.all
      .filter(account => account.votes.length > 0)
      .map(account => {
        let balance =
          account.balances[this.settings.governingToken.hashHex] || utils.ZERO;
        balance = balance.add(changes[account.hashHex] || utils.ZERO);
        return balance.lte(utils.ZERO)
          ? null
          : ({
            publicKeys: account.votes,
            count: balance,
          });
      }).toArray().toPromise();
    if (votes.length === 0) {
      return [{
        publicKeys: this.settings.standbyValidators,
        count: this.settings.governingToken.asset.amount,
      }];
    }

    return votes.filter(Boolean);
  }

  _createWriteBlockchain(): WriteBatchBlockchain {
    return new WriteBatchBlockchain({
      settings: this.settings,
      currentBlock: this._currentBlock,
      currentHeader: this._currentHeader,
      storage: this._storage,
      vm: this._vm,
      onStep: this._onStep,
    });
  }

  _getInvocationData = async (
    transaction: InvocationTransaction,
  ): Promise<SerializableInvocationData> => {
    const data = await this._storage.invocationData.get({
      hash: transaction.hash,
    });
    const [asset, contracts, actions] = await Promise.all([
      data.assetHash == null
        ? Promise.resolve(null)
        : this._storage.asset.get({ hash: data.assetHash }),
      Promise.all(data.contractHashes.map(
        contractHash => this._storage.contract.get({ hash: contractHash }),
      )),
      // TODO: Make this more efficient with a DataLoader
      this._storage.action.getAll({
        blockIndexStart: data.blockIndex,
        transactionIndexStart: data.transactionIndex,
        blockIndexStop: data.blockIndex,
        transactionIndexStop: data.transactionIndex,
      }).toArray().toPromise(),
    ]);

    return { asset, contracts, actions, result: data.result };
  }

  _onStep = ({ context, opCode}: OnStepInput) => {
    const scriptHash = common.uInt160ToString(context.scriptHash);
    this.logger({
      event: 'VM_STEP',
      level: 'silly',
      message: `Step (${scriptHash}): ${context.pc}:${opCode}`,
      meta: {
        type: 'extra',
        scriptHash,
        pc: context.pc,
        opCode,
      },
      context: this._loggingContext,
    });
  }
}
