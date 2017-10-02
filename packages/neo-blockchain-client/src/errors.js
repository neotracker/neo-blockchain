/* @flow */
import type { ContractParameter, ContractParameterType } from './types';

export class UnknownBlockError extends Error {
  unknownBlock: boolean = true;
  constructor() {
    super('Unknown block');
  }
}

export class InvalidContractParameterError extends Error {
  parameter: ContractParameter;
  expected: Array<ContractParameterType>;
  constructor(
    parameter: ContractParameter,
    expected: Array<ContractParameterType>,
  ) {
    super(
      `Expected one of ${JSON.stringify(expected)} ` +
      `ContractParameterTypes, found ${parameter.type}`,
    );
    this.parameter = parameter;
    this.expected = expected;
  }
}

export class SendTransactionError extends Error {
  constructor() {
    super('Something went wrong!');
  }
}
