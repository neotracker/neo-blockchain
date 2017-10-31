/* @flow */
import type { Hash160Like } from './types';

export type ActionFilter = {|
  blockIndexStart?: number,
  transactionIndexStart?: number,
  indexStart?: number,
  blockIndexStop?: number,
  transactionIndexStop?: number,
  indexStop?: number,
|};

export type BlockFilter = {|
  indexStart?: number,
  indexStop?: number,
|};

export type GetActionsFilter = {|
  blockIndexStart?: number,
  transactionIndexStart?: number,
  indexStart?: number,
  blockIndexStop?: number,
  transactionIndexStop?: number,
  indexStop?: number,
  scriptHash?: Hash160Like,
|};
