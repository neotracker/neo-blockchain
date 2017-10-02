/* @flow */
import type { Contract } from 'neo-blockchain-core';

import ObjectStackItem from './ObjectStackItem';

export default class ContractStackItem extends ObjectStackItem<Contract> {
  asContract(): Contract {
    return this.value;
  }
}
