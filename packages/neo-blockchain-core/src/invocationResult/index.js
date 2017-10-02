/* @flow */
export {
  INVOCATION_RESULT_TYPE,
  InvalidInvocationResultTypeError,
  assertInvocationResultType,
} from './InvocationResultType';
export { default as InvocationResultSuccess } from './InvocationResultSuccess';
export { default as InvocationResultError } from './InvocationResultError';

export {
  deserializeWire,
  deserializeWireBase,
} from './InvocationResult';

export type {
  InvocationResult,
  InvocationResultJSON,
} from './InvocationResult';
export type { InvocationResultType } from './InvocationResultType';
