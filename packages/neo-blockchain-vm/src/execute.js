/* @flow */
import type BN from 'bn.js';
import {
  type ExecutionAction,
  type Script,
  type ExecuteScriptsResult,
  type TriggerType,
  type VMContext,
  type WriteBlockchain,
} from 'neo-blockchain-node-core';
import {
  type ScriptContainer,
  type OpCode,
  crypto,
  utils,
} from 'neo-blockchain-core';

import {
  type ExecutionContext,
  type ExecutionInit,
  type Options,
  MAX_ARRAY_SIZE,
  MAX_INVOCATION_STACK_SIZE,
  MAX_ITEM_SIZE,
  MAX_STACK_SIZE,
} from './constants';
import {
  AltStackUnderflowError,
  ArrayOverflowError,
  InvocationStackOverflowError,
  ItemOverflowError,
  OutOfGASError,
  StackOverflowError,
  StackUnderflowError,
  UnknownError,
  VMErrorNew,
} from './errors';

import { lookupOp } from './opcodes';

const createVMContext = (context: ExecutionContext): VMContext => ({
  script: {
    code: context.code,
    pushOnly: context.pushOnly,
  },
  scriptHash: context.scriptHash,
  pc: context.pc,
  depth: context.depth,
  get stack() {
    return context.stack.map(val => val.toContractParameter());
  },
  get stackAlt() {
    return context.stackAlt.map(val => val.toContractParameter());
  },
  done: context.done,
  gasLeft: context.gasLeft,
});

const executeNext = async ({
  context: contextIn,
}: {|
  context: ExecutionContext,
|}): Promise<ExecutionContext> => {
  let context = contextIn;
  if (context.done) {
    return context;
  }

  if (context.pc >= context.code.length) {
    return {
      ...(context: $FlowFixMe),
      done: true,
    };
  }

  const op = lookupOp({ context });
  // eslint-disable-next-line
  context = op.context;

  const { onStep } = context.init;
  if (onStep != null) {
    await onStep({
      context: createVMContext(context),
      opCode: op.name,
    });
  }

  if (context.stack.length < op.in) {
    throw new StackUnderflowError(
      context,
      op.name,
      context.stack.length,
      op.in,
    );
  }

  if (context.stackAlt.length < op.inAlt) {
    throw new AltStackUnderflowError();
  }

  const stackSize =
    context.stack.length +
    context.stackAlt.length +
    op.out +
    op.outAlt +
    op.modify +
    op.modifyAlt -
    op.in -
    op.inAlt;
  if (stackSize > MAX_STACK_SIZE) {
    throw new StackOverflowError();
  }

  if (context.depth + op.invocation > MAX_INVOCATION_STACK_SIZE) {
    throw new InvocationStackOverflowError();
  }

  if (op.array > MAX_ARRAY_SIZE) {
    throw new ArrayOverflowError();
  }

  if (op.item > MAX_ITEM_SIZE) {
    throw new ItemOverflowError();
  }

  const args = context.stack.slice(0, op.in);
  const argsAlt = context.stackAlt.slice(0, op.inAlt);

  context = {
    ...context,
    stack: context.stack.slice(op.in),
    stackAlt: context.stackAlt.slice(op.inAlt),
    gasLeft: context.gasLeft.sub(op.fee),
  };

  if (context.gasLeft.lt(utils.ZERO)) {
    throw new OutOfGASError();
  }

  let result;
  try {
    result = op.invoke({ context, args, argsAlt });
    if (result instanceof Promise) {
      result = await result;
    }
  } catch (error) {
    if (error instanceof VMErrorNew) {
      throw error;
    }
    const newError = new VMErrorNew(context, `VM Error: ${error.message}`);
    newError.stack = error.stack;
    throw newError;
  }

  const { context: newContext, results, resultsAlt } = result;
  context = newContext;

  if (op.out > 0) {
    if (results == null || results.length !== op.out) {
      throw new UnknownError();
    } else {
      context = {
        ...context,
        stack: [...results].reverse().concat(context.stack),
      };
    }
  } else if (results != null) {
    throw new UnknownError();
  }

  if (op.outAlt > 0) {
    if (resultsAlt == null || resultsAlt.length !== op.outAlt) {
      throw new UnknownError();
    } else {
      context = {
        ...context,
        stackAlt: [...resultsAlt].reverse().concat(context.stackAlt),
      };
    }
  } else if (resultsAlt != null) {
    throw new UnknownError();
  }

  return (context: $FlowFixMe);
};

const run = async ({
  context: contextIn,
}: {|
  context: ExecutionContext,
|}): Promise<ExecutionContext> => {
  let context = contextIn;
  while (!context.done) {
    // eslint-disable-next-line
    context = await executeNext({ context });
  }

  return context;
};

const executeScript = ({
  code,
  pushOnly,
  blockchain,
  init,
  gasLeft,
  options: optionsIn,
}: {|
  code: Buffer,
  pushOnly?: boolean,
  blockchain: WriteBlockchain,
  init: ExecutionInit,
  gasLeft: BN,
  options?: Options,
|}): Promise<ExecutionContext> => {
  const options = optionsIn || {};
  const scriptHash = crypto.hash160(code);

  const context = {
    blockchain,
    init,
    engine: {
      run,
      executeScript,
    },
    code,
    pushOnly: !!pushOnly,
    scriptHash,
    callingScriptHash: options.scriptHash || null,
    entryScriptHash: options.entryScriptHash || scriptHash,
    pc: 0,
    depth: options.depth || 1,
    stack: options.stack || [],
    stackAlt: options.stackAlt || [],
    done: false,
    gasLeft,
    actionIndex: options.actionIndex || 0,
    createdContracts: options.createdContracts || {},
  };

  return run({ context });
};

export default async ({
  scripts,
  blockchain,
  scriptContainer,
  triggerType,
  action,
  gas,
  onStep,
}: {|
  scripts: Array<Script>,
  blockchain: WriteBlockchain,
  scriptContainer: ScriptContainer,
  triggerType: TriggerType,
  action: ExecutionAction,
  gas: BN,
  onStep?: (input: {| context: VMContext, opCode: OpCode |}) => void,
|}): Promise<ExecuteScriptsResult> => {
  const init = {
    scriptContainer,
    triggerType,
    action,
    onStep,
  };

  let context;
  for (const [idx, script] of scripts.entries()) {
    const scriptHash =
      idx + 1 < scripts.length ? crypto.hash160(scripts[idx + 1].code) : null;
    const entryScriptHash = crypto.hash160(scripts[scripts.length - 1].code);
    let options = {
      depth: scripts.length - idx,
      stack: [],
      stackAlt: [],
      actionIndex: 0,
      createdContracts: {},
      scriptHash,
      entryScriptHash,
    };
    if (context != null) {
      options = {
        depth: scripts.length - idx,
        stack: context.stack,
        stackAlt: context.stackAlt,
        actionIndex: context.actionIndex,
        createdContracts: context.createdContracts,
        scriptHash,
        entryScriptHash,
      };
    }

    // eslint-disable-next-line
    context = await executeScript({
      code: script.code,
      pushOnly: script.pushOnly,
      blockchain,
      init,
      gasLeft: gas,
      options,
    });
  }

  const finalContext = await context;
  if (finalContext == null) {
    return {
      stack: [],
      stackAlt: [],
      gasLeft: gas,
    };
  }

  return {
    stack: finalContext.stack.map(item => item.toContractParameter()),
    stackAlt: finalContext.stackAlt.map(item => item.toContractParameter()),
    gasLeft: finalContext.gasLeft,
  };
};
