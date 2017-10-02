/* @flow */
import type { Endpoint } from 'neo-blockchain-node-core';

export class ReceiveMessageTimeoutError extends Error {
  constructor() {
    super('Receive message timeout.');
  }
}

export class UnsupportedEndpointType extends Error {
  endpoint: Endpoint;

  constructor(endpoint: Endpoint) {
    super(`Unsupported endpoint type: ${endpoint}`);
    this.endpoint = endpoint;
  }
}
