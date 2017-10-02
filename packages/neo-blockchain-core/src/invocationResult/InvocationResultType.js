/* @flow */
export const INVOCATION_RESULT_TYPE = {
  ERROR: 0x00,
  SUCCESS: 0x01,
};

export type InvocationResultType =
  0x00 |
  0x01;

export class InvalidInvocationResultTypeError extends Error {
  value: number;

  constructor(value: number) {
    super(`Expected invocation result type, found: ${value.toString(16)}`);
    this.value = value;
  }
}

export const assertInvocationResultType = (
  value: number,
): InvocationResultType => {
  switch (value) {
    case INVOCATION_RESULT_TYPE.ERROR:
      return INVOCATION_RESULT_TYPE.ERROR;
    case INVOCATION_RESULT_TYPE.SUCCESS:
      return INVOCATION_RESULT_TYPE.SUCCESS;
    default:
      throw new InvalidInvocationResultTypeError(value);
  }
};
