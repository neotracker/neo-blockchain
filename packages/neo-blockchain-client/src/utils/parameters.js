/* @flow */
import BigNumber from 'bignumber.js';
import {
  JSONHelper,
  common,
  utils,
} from 'neo-blockchain-core';

import type { ContractParameter } from '../types';
import { InvalidContractParameterError } from '../errors';

type To<T> = (parameter: ContractParameter) => T;

function createNullable<T>(to: To<T>): To<?T> {
  return (parameter) => {
    try {
      return to(parameter);
    } catch (error) {
      return null;
    }
  };
}

const toString = (parameter: ContractParameter): string => {
  if (parameter.type === 'String') {
    return parameter.value;
  } else if (parameter.type === 'ByteArray') {
    return JSONHelper.readBuffer(parameter.value).toString('utf8');
  }

  throw new InvalidContractParameterError(parameter, ['String', 'ByteArray']);
};
const toStringNullable = (createNullable(toString): To<?string>);

const toHash160 = (parameter: ContractParameter): string => {
  if (parameter.type === 'Hash160') {
    return parameter.value;
  } else if (parameter.type === 'ByteArray') {
    return common.uInt160ToString(
      common.bufferToUInt160(JSONHelper.readBuffer(parameter.value)),
    );
  }

  throw new InvalidContractParameterError(parameter, ['Hash160', 'ByteArray']);
};
const toHash160Nullable = (createNullable(toHash160): To<?string>);

const toInteger = (parameter: ContractParameter): BigNumber => {
  if (parameter.type === 'Integer') {
    return new BigNumber(parameter.value);
  } else if (parameter.type === 'ByteArray') {
    return new BigNumber(
      utils.fromSignedBuffer(JSONHelper.readBuffer(parameter.value))
        .toString(10),
    );
  }

  throw new InvalidContractParameterError(parameter, ['Integer', 'ByteArray']);
}
const toIntegerNullable = (createNullable(toInteger): To<?BigNumber>);

export default {
  toString,
  toStringNullable,
  toHash160,
  toHash160Nullable,
  toInteger,
  toIntegerNullable,
};
