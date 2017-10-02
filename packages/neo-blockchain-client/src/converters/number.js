/* @flow */
import BigNumber from 'bignumber.js';

import type Client from '../Client';
import type { Number } from '../types';

export default (client: Client, value: Number): BigNumber =>
  new BigNumber(value);
