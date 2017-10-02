/* @flow */
import { type PrivateKey, common } from 'neo-blockchain-core';

import type Client from '../Client';
import type { PrivateKeyLike } from '../types';

export default (client: Client, privateKeyLike: PrivateKeyLike): PrivateKey => {
  if (typeof privateKeyLike === 'string') {
    try {
      return client._wifToPrivateKey(privateKeyLike);
    } catch (error) {
      return common.stringToPrivateKey(privateKeyLike);
    }
  } else if (privateKeyLike instanceof Buffer) {
    return common.bufferToPrivateKey(privateKeyLike);
  }

  return common.hexToPrivateKey(privateKeyLike);
}
