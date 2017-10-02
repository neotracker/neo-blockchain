/* @flow */
import type { Asset } from 'neo-blockchain-core';

import ObjectStackItem from './ObjectStackItem';

export default class AssetStackItem extends ObjectStackItem<Asset> {
  asAsset(): Asset {
    return this.value;
  }
}
