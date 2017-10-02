/* @flow */
export class InvalidFormatError extends Error {
  constructor() {
    super('Invalid format.');
  }
}

export class VerifyError extends Error {
  constructor(reason: string) {
    super(`Verification failed: ${reason}`);
  }
}
