/* @flow */

export class InvalidValueArrayError extends Error {
  constructor() {
    super('Invalid Value. Expected Array');
  }
}

export class InvalidValueBufferError extends Error {
  constructor() {
    super('Invalid Value. Expected Buffer');
  }
}

export class InvalidValueHeaderError extends Error {
  constructor() {
    super('Invalid Value. Expected Header');
  }
}

export class InvalidValueBlockError extends Error {
  constructor() {
    super('Invalid Value. Expected Block');
  }
}

export class InvalidValueBlockBaseError extends Error {
  constructor() {
    super('Invalid Value. Expected BlockBase');
  }
}

export class InvalidValueTransactionError extends Error {
  constructor() {
    super('Invalid Value. Expected Transaction');
  }
}

export class InvalidValueAttributeError extends Error {
  constructor() {
    super('Invalid Value. Expected Attribute');
  }
}

export class InvalidValueAttributeStackItemError extends Error {
  constructor() {
    super('Invalid Value. Expected AttributeStackItem');
  }
}

export class InvalidValueInputError extends Error {
  constructor() {
    super('Invalid Value. Expected Input');
  }
}

export class InvalidValueOutputError extends Error {
  constructor() {
    super('Invalid Value. Expected Output');
  }
}

export class InvalidValueAccountError extends Error {
  constructor() {
    super('Invalid Value. Expected Account');
  }
}

export class InvalidValueAssetError extends Error {
  constructor() {
    super('Invalid Value. Expected Asset');
  }
}

export class InvalidValueContractError extends Error {
  constructor() {
    super('Invalid Value. Expected Contract');
  }
}

export class InvalidValueValidatorError extends Error {
  constructor() {
    super('Invalid Value. Expected Validator');
  }
}

export class InvalidValueStorageContextStackItemError extends Error {
  constructor() {
    super('Invalid Value. Expected StorageContextStackItem');
  }
}
