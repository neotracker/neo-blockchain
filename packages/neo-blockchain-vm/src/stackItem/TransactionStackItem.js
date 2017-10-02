/* @flow */
import type { Transaction } from 'neo-blockchain-core';

import ObjectStackItem from './ObjectStackItem';

export default class TransactionStackItem extends ObjectStackItem<Transaction> {
  asTransaction(): Transaction {
    return this.value;
  }
}
