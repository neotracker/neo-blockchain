/* @flow */
import {
  InvalidInvocationResultTypeError,
  assertInvocationResultType,
} from './InvocationResultType';
import {
  type DeserializeWire,
  type DeserializeWireBaseOptions,
  createDeserializeWire,
} from '../Serializable';

import InvocationResultSuccess from './InvocationResultSuccess';
import InvocationResultError from './InvocationResultError';

import type { InvocationResultSuccessJSON } from './InvocationResultSuccess';
import type { InvocationResultErrorJSON } from './InvocationResultError';

export type InvocationResult =
  InvocationResultSuccess |
  InvocationResultError;
export type InvocationResultJSON =
  InvocationResultSuccessJSON |
  InvocationResultErrorJSON;

export const deserializeWireBase = (
  options: DeserializeWireBaseOptions,
): InvocationResult => {
  const { reader } = options;
  const type = assertInvocationResultType(reader.clone().readUInt8());
  switch (type) {
    case 0x00:
      return InvocationResultError.deserializeWireBase(options);
    case 0x01:
      return InvocationResultSuccess.deserializeWireBase(options);
    default:
      // eslint-disable-next-line
      (type: empty)
      throw new InvalidInvocationResultTypeError(type);
  }
}

export const deserializeWire: DeserializeWire<InvocationResult> =
  createDeserializeWire(deserializeWireBase);
