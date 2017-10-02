/* @flow */
import BN from 'bn.js';
import {
  ASSET_TYPE,
  OPCODE_TO_BYTECODE,
  type ECPoint,
  Block,
  IssueTransaction,
  MinerTransaction,
  Output,
  RegisterTransaction,
  ScriptBuilder,
  Witness,
  common,
  crypto,
  utils,
} from 'neo-blockchain-core';

export const GENERATION_AMOUNT = [8, 7, 6, 5, 4, 3, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1];
export const DECREMENT_INTERVAL = 2000000;

type Options = {|
  standbyValidators: Array<ECPoint>,
|};

const getGoverningToken = () => {
  const scriptBuilder = new ScriptBuilder();
  scriptBuilder.emitOp('PUSH1');
  const admin = crypto.toScriptHash(scriptBuilder.build());
  return new RegisterTransaction({
    asset: {
      type: ASSET_TYPE.GOVERNING_TOKEN,
      name: "[{\"lang\":\"zh-CN\",\"name\":\"小蚁股\"},{\"lang\":\"en\",\"name\":\"AntShare\"}]",
      amount: common.fixed8FromDecimal(utils.ONE_HUNDRED_MILLION),
      precision: 0,
      // TODO: Fix size calculation - should be 1 for infinite point
      owner: common.ECPOINT_INFINITY,
      admin,
    },
  });
}

const getUtilityToken = () => {
  const scriptBuilder = new ScriptBuilder();
  scriptBuilder.emitOp('PUSH0');
  const admin = crypto.toScriptHash(scriptBuilder.build());
  return new RegisterTransaction({
    asset: {
      type: ASSET_TYPE.UTILITY_TOKEN,
      name: "[{\"lang\":\"zh-CN\",\"name\":\"小蚁币\"},{\"lang\":\"en\",\"name\":\"AntCoin\"}]",
      amount: common.fixed8FromDecimal(GENERATION_AMOUNT.reduce(
        (acc, value) => acc.addn(value),
        utils.ZERO,
      ).mul(new BN(DECREMENT_INTERVAL))),
      precision: 8,
      owner: common.ECPOINT_INFINITY,
      admin,
    },
  });
};

const getGenesisBlock = ({
  standbyValidators,
  governingToken,
  utilityToken,
}: {|
  ...Options,
  governingToken: RegisterTransaction,
  utilityToken: RegisterTransaction,
|}) => new Block({
  previousHash: common.ZERO_UINT256,
  timestamp: 1468595301,
  index: 0,
  consensusData: new BN(2083236893),
  nextConsensus: crypto.getConsensusAddress(standbyValidators),
  script: new Witness({
    invocation: Buffer.from([]),
    verification: Buffer.from([OPCODE_TO_BYTECODE.PUSH1]),
  }),
  transactions: [
    new MinerTransaction({ nonce: 2083236893 }),
    governingToken,
    utilityToken,
    new IssueTransaction({
      outputs: [new Output({
        asset: governingToken.hash,
        value: governingToken.asset.amount,
        address: crypto.toScriptHash(
          crypto.createMultiSignatureRedeemScript(
            standbyValidators.length / 2 + 1,
            standbyValidators,
          ),
        ),
      })],
      scripts: [new Witness({
        invocation: Buffer.from([]),
        verification: Buffer.from([OPCODE_TO_BYTECODE.PUSH1]),
      })],
    }),
  ],
});

export default (options: Options) => {
  const governingToken = getGoverningToken();
  const utilityToken = getUtilityToken();
  return {
    genesisBlock: getGenesisBlock({
      standbyValidators: options.standbyValidators,
      governingToken,
      utilityToken,
    }),
    governingToken,
    utilityToken,
    decrementInterval: DECREMENT_INTERVAL,
    generationAmount: GENERATION_AMOUNT,
  };
};
