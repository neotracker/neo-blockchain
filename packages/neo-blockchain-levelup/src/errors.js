/* @flow */
export class NotFoundError extends Error {
  notFound: boolean
  constructor() {
    super('Not found');
    this.notFound = true;
  }
}

export class UnknownTypeError extends Error {
  constructor() {
    super('Unknown type');
  }
}

export class KeyNotFoundError extends Error {
  notFound: boolean;
  constructor(keyString: string) {
    super(`Key ${keyString} not found in database`);
    this.notFound = true;
  }
}
