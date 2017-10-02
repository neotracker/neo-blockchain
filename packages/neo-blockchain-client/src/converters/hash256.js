/* @flow */
import { type UInt256, common } from 'neo-blockchain-core';

import type Client from '../Client';
import type { Hash256Like } from '../types';

export default (client: Client, hash: Hash256Like): UInt256 => {
  if (typeof hash === 'string') {
    return common.stringToUInt256(hash);
  } else if (hash instanceof Buffer) {
    return common.bufferToUInt256(hash);
  }

  return common.hexToUInt256(hash);
}
