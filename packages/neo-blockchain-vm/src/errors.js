/* @flow */
import type BN from 'bn.js';
import {
  type OpCode,
} from 'neo-blockchain-core';

import {
  type ExecutionContext,
} from './constants';

import disassembleByteCode from './disassembleByteCode';

export class VMError extends Error {};

export class VMErrorNew extends Error {
  constructor(context: ExecutionContext, message: string) {
    const debug = disassembleByteCode(context.code).join('\n');
    const stack = context.stack.map(item => item.toString()).join('\n');
    const pc = context.pc;
    super(`${message}\nPC: ${pc}\nCode:\n${debug}\nStack:\n${stack}`);
  }
}

export class ThrowError extends VMErrorNew {
  constructor(context: ExecutionContext) {
    super(context, 'Script execution threw an Error');
  }
}

export class UnknownOpError extends VMErrorNew {
  byteCode: string;

  constructor(context: ExecutionContext, byteCode: string) {
    super(context, `Unknown op: ${byteCode}`)
    this.byteCode = byteCode;
  }
}

export class PushOnlyError extends VMError {
  byteCode: number;

  constructor(byteCode: number) {
    super(`Push only mode, found non-push byte code: ${byteCode}`);
    this.byteCode = byteCode;
  }
}

export class StackUnderflowError extends VMErrorNew {
  constructor(
    context: ExecutionContext,
    op: OpCode,
    stackLength: number,
    expected: number,
  ) {
    super(
      context,
      `Stack Underflow. Op: ${op}. Stack Length: ${stackLength}. ` +
      `Expected: ${expected}`
    );
  }
}

export class NumberTooLargeError extends VMErrorNew {
  constructor(
    context: ExecutionContext,
    value: BN,
  ) {
    super(
      context,
      `Number too large to be represented in Javascript: ${value.toString(10)}`,
    );
  }
}

export class AltStackUnderflowError extends VMError {
  constructor() {
    super(`Stack Underflow.`);
  }
}

export class StackOverflowError extends VMError {
  constructor() {
    super('Stack Overflow');
  }
}

export class InvocationStackOverflowError extends VMError {
  constructor() {
    super('Invocation Stack Overflow');
  }
}

export class ArrayOverflowError extends VMError {
  constructor() {
    super('Array Overflow');
  }
}

export class ItemOverflowError extends VMError {
  constructor() {
    super('Item Overflow');
  }
}

export class OutOfGASError extends VMError {
  constructor() {
    super('Out of GAS');
  }
}

export class CodeOverflowError extends VMError {
  constructor() {
    super('Code Overflow');
  }
}

export class UnknownSysCallError extends VMErrorNew {
  sysCall: string;

  constructor(context: ExecutionContext, sysCall: string) {
    super(context, `Unknown SysCall: ${sysCall}`);
    this.sysCall = sysCall;
  }
}

export class UnknownOPError extends VMError {
  constructor() {
    super('Unnown Op');
  }
}

export class UnknownError extends VMError {
  constructor() {
    super('Unknown Error');
  }
}

export class XTuckNegativeError extends VMError {
  constructor() {
    super('XTUCK Negative Index');
  }
}

export class XSwapNegativeError extends VMError {
  constructor() {
    super('XSWAP Negative Index');
  }
}

export class XDropNegativeError extends VMError {
  constructor() {
    super('XDROP Negative Index');
  }
}

export class PickNegativeError extends VMError {
  constructor() {
    super('PICK Negative Index');
  }
}

export class RollNegativeError extends VMError {
  constructor() {
    super('ROLL Negative Index');
  }
}

export class SubstrNegativeEndError extends VMError {
  constructor() {
    super('SUBSTR Negative End');
  }
}

export class SubstrNegativeStartError extends VMError {
  constructor() {
    super('SUBSTR Negative Start');
  }
}

export class LeftNegativeError extends VMError {
  constructor() {
    super('LEFT Negative Index');
  }
}

export class RightNegativeError extends VMError {
  constructor() {
    super('RIGHT Negative Index');
  }
}

export class RightLengthError extends VMError {
  constructor() {
    super('RIGHT Length Less Than Index');
  }
}

export class InvalidAssetTypeError extends VMError {
  constructor() {
    super('Invalid Asset Type.');
  }
}

export class InvalidCheckMultisigArgumentsError extends VMError {
  constructor() {
    super('Invalid CHECKMULTISIG Arguments');
  }
}

export class InvalidPackCountError extends VMError {
  constructor() {
    super('Invalid PACK Count');
  }
}

export class InvalidPickItemIndexError extends VMError {
  constructor() {
    super('Invalid PICKITEM Index');
  }
}

export class InvalidSetItemIndexError extends VMError {
  constructor() {
    super('Invalid SETITEM Index');
  }
}

export class InvalidCheckWitnessArgumentsError extends VMError {
  constructor() {
    super('Invalid CheckWitness Arguments');
  }
}

export class InvalidGetHeaderArgumentsError extends VMError {
  constructor() {
    super('Invalid GETHEADER Arguments');
  }
}

export class InvalidGetBlockArgumentsError extends VMErrorNew {
  constructor(context: ExecutionContext, arg: ?Buffer) {
    super(
      context,
      `Invalid GETBLOCK Argument: ` +
      `${arg == null ? 'null' : arg.toString('hex')}`,
    );
  }
}

export class InvalidIndexError extends VMError {
  constructor() {
    super('Invalid Index.');
  }
}

export class ContractNoStorageError extends VMError {
  constructor(hash: string) {
    super(`Contract Does Not Have Storage: ${hash}`);
  }
}

export class TooManyVotesError extends VMError {
  constructor() {
    super('Too Many Votes');
  }
}

export class AccountFrozenError extends VMError {
  constructor() {
    super('Account Frozen');
  }
}

export class NotEligibleVoteError extends VMError {
  constructor() {
    super('Ineligible To Vote');
  }
}

export class BadWitnessCheckError extends VMError {
  constructor() {
    super('Bad Witness');
  }
}

export class UnexpectedScriptContainerError extends VMError {
  constructor() {
    super('Unexpected Script Container');
  }
}

export class InvalidGetStorageContextError extends VMError {
  constructor() {
    super('Invalid Get Storage Context');
  }
}

export class InvalidContractGetStorageContextError extends VMError {
  constructor() {
    super('Invalid Contract.GetStorageContext context');
  }
}
