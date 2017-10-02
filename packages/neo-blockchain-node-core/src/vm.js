/* @flow */
import type BN from 'bn.js';
import {
  BYTECODE_TO_OPCODE,
  OPCODE_TO_BYTECODE,
  type ContractParameter,
  type OpCode,
  type ScriptContainer,
  type UInt160,
  type UInt256,
  common,
} from 'neo-blockchain-core';

import type { WriteBlockchain } from './Blockchain';

export { BYTECODE_TO_OPCODE, OPCODE_TO_BYTECODE };

export const TRIGGER_TYPE = {
  VERIFICATION: 0x00,
  APPLICATION: 0x10,
};

export type TriggerType =
  0x00 | // Verification
  0x10; // Application

export type Script = {|
  code: Buffer,
  pushOnly?: boolean,
|};
export const NULL_ACTION = {
  blockIndex: -1,
  blockHash: common.ZERO_UINT256,
  transactionIndex: -1,
  transactionHash: common.ZERO_UINT256,
};
export type ExecutionAction = {|
  blockIndex: number,
  blockHash: UInt256,
  transactionIndex: number,
  transactionHash: UInt256,
|};
export type ExecuteScriptsResult = {|
  stack: Array<ContractParameter>,
  stackAlt: Array<ContractParameter>,
  gasLeft: BN,
|};
export type VMContext = {|
  script: Script,
  scriptHash: UInt160,
  pc: number,
  depth: number,
  stack: Array<ContractParameter>,
  stackAlt: Array<ContractParameter>,
  done: boolean,
  gasLeft: BN,
|};
export type OnStepInput = {| context: VMContext, opCode: OpCode |};
export type OnStep = (input: OnStepInput) => void;
export type ExecuteScripts = (input: {|
  scripts: Array<Script>,
  blockchain: WriteBlockchain,
  scriptContainer: ScriptContainer,
  triggerType: TriggerType,
  action: ExecutionAction,
  gas: BN,
  // eslint-disable-next-line
  onStep?: OnStep,
|}) => Promise<ExecuteScriptsResult>;

export type VM = {|
  executeScripts: ExecuteScripts,
|};
