/* @flow */
export const CONTRACT_PARAMETER_TYPE = {
  SIGNATURE: 0x00,
  BOOLEAN: 0x01,
  INTEGER: 0x02,
  HASH160: 0x03,
  HASH256: 0x04,
  BYTE_ARRAY: 0x05,
  PUBLIC_KEY: 0x06,
  STRING: 0x07,
  ARRAY: 0x10,
  INTEROP_INTERFACE: 0xf0,
  VOID: 0xff,
};

export type ContractParameterType =
  | 0x00
  | 0x01
  | 0x02
  | 0x03
  | 0x04
  | 0x05
  | 0x06
  | 0x07
  | 0x10
  | 0xf0
  | 0xff;

export class InvalidContractParameterTypeError extends Error {
  contractParameterType: number;

  constructor(contractParameterType: number) {
    super(
      `Expected contract parameter type, ` +
        `found: ${contractParameterType.toString(16)}`,
    );
    this.contractParameterType = contractParameterType;
  }
}

export const assertContractParameterType = (
  value: number,
): ContractParameterType => {
  switch (value) {
    case CONTRACT_PARAMETER_TYPE.SIGNATURE:
      return CONTRACT_PARAMETER_TYPE.SIGNATURE;
    case CONTRACT_PARAMETER_TYPE.BOOLEAN:
      return CONTRACT_PARAMETER_TYPE.BOOLEAN;
    case CONTRACT_PARAMETER_TYPE.INTEGER:
      return CONTRACT_PARAMETER_TYPE.INTEGER;
    case CONTRACT_PARAMETER_TYPE.HASH160:
      return CONTRACT_PARAMETER_TYPE.HASH160;
    case CONTRACT_PARAMETER_TYPE.HASH256:
      return CONTRACT_PARAMETER_TYPE.HASH256;
    case CONTRACT_PARAMETER_TYPE.BYTE_ARRAY:
      return CONTRACT_PARAMETER_TYPE.BYTE_ARRAY;
    case CONTRACT_PARAMETER_TYPE.PUBLIC_KEY:
      return CONTRACT_PARAMETER_TYPE.PUBLIC_KEY;
    case CONTRACT_PARAMETER_TYPE.STRING:
      return CONTRACT_PARAMETER_TYPE.STRING;
    case CONTRACT_PARAMETER_TYPE.ARRAY:
      return CONTRACT_PARAMETER_TYPE.ARRAY;
    case CONTRACT_PARAMETER_TYPE.INTEROP_INTERFACE:
      return CONTRACT_PARAMETER_TYPE.INTEROP_INTERFACE;
    // TODO: Seems to be a bug in the TestNet
    case 0x16:
      return CONTRACT_PARAMETER_TYPE.ARRAY;
    case CONTRACT_PARAMETER_TYPE.VOID:
      return CONTRACT_PARAMETER_TYPE.VOID;
    default:
      throw new InvalidContractParameterTypeError(value);
  }
};

export type ContractParameterTypeJSON =
  | 'Signature'
  | 'Boolean'
  | 'Integer'
  | 'Hash160'
  | 'Hash256'
  | 'ByteArray'
  | 'PublicKey'
  | 'String'
  | 'Array'
  | 'InteropInterface'
  | 'Void';

export const toJSONContractParameterType = (
  type: ContractParameterType,
): ContractParameterTypeJSON => {
  switch (type) {
    case 0x00:
      return 'Signature';
    case 0x01:
      return 'Boolean';
    case 0x02:
      return 'Integer';
    case 0x03:
      return 'Hash160';
    case 0x04:
      return 'Hash256';
    case 0x05:
      return 'ByteArray';
    case 0x06:
      return 'PublicKey';
    case 0x07:
      return 'String';
    case 0x10:
      return 'Array';
    case 0xf0:
      return 'InteropInterface';
    case 0xff:
      return 'Void';
    default:
      // eslint-disable-next-line
      (type: empty);
      throw new InvalidContractParameterTypeError(type);
  }
};
