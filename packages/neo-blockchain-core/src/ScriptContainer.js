/* @flow */
import type Block from './Block';
import type { Transaction } from './transaction';

export const SCRIPT_CONTAINER_TYPE = {
  TRANSACTION: 0x00,
  BLOCK: 0x01,
};

export type ScriptContainer =
  {| type: 0x00, value: Transaction |} |
  {| type: 0x01, value: Block |};
export type ScriptContainerType =
  0x00 |
  0x01;

export class InvalidScriptContainerTypeError extends Error {
  value: number;

  constructor(value: number) {
    super(`Expected script container type, found: ${value.toString(16)}`)
    this.value = value;
  }
}

export const assertScriptContainerType = (
  value: number,
): ScriptContainerType => {
  switch (value) {
    case 0x00:
      return SCRIPT_CONTAINER_TYPE.TRANSACTION;
    case 0x01:
      return SCRIPT_CONTAINER_TYPE.BLOCK;
    default:
      throw new InvalidScriptContainerTypeError(value);
  }
};
