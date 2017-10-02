/* @flow */
export class GenesisBlockNotRegisteredError extends Error {
  constructor() {
    super('Genesis block was not registered with storage.');
  }
}

export class VerifyError extends Error {
  constructor() {
    super('Script verification failed.');
  }
}

export class WitnessVerifyError extends Error {
  constructor() {
    super('Witness verification failed.');
  }
}
