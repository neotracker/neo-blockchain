/* @flow */
import { type UInt160, common } from 'neo-blockchain-core';

import type Client from '../Client';
import type { Hash160Like } from '../types';

export default (client: Client, hash: Hash160Like): UInt160 => {
  if (typeof hash === 'string') {
    try {
      return client._addressToScriptHash(hash);
    } catch (error) {
      return common.stringToUInt160(hash);
    }
  } else if (hash instanceof Buffer) {
    return common.bufferToUInt160(hash);
  }

  return common.hexToUInt160(hash);
}
