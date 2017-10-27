/* @flow */
import { Observable } from 'rxjs';
import { type Block, common, utils } from 'neo-blockchain-core';
import {
  type ChangeSet,
  type AddChange,
  type DeleteChange,
  type ReadStorage,
  type ReadAllStorage,
  type ReadGetAllStorage,
} from 'neo-blockchain-node-core';

type TrackedChange<Key, Value> =
  | {| type: 'add', value: Value |}
  | {| type: 'delete', key: Key |};

type GetFunc<Key, Value> = (key: Key) => Promise<Value>;
type TryGetFunc<Key, Value> = (key: Key) => Promise<?Value>;

function createGet<Key, Value>({
  tryGetTracked,
  readStorage,
}: {|
  tryGetTracked: (key: Key) => ?TrackedChange<Key, Value>,
  readStorage: ReadStorage<Key, Value>,
|}): GetFunc<Key, Value> {
  return async (key: Key): Promise<Value> => {
    const trackedChange = tryGetTracked(key);
    if (trackedChange != null) {
      // TODO: Better error
      if (trackedChange.type === 'delete') {
        throw new Error('Not found');
      }

      return trackedChange.value;
    }

    const value = await readStorage.get(key);
    return value;
  };
}

function createTryGet<Key, Value>({
  tryGetTracked,
  readStorage,
}: {|
  tryGetTracked: (key: Key) => ?TrackedChange<Key, Value>,
  readStorage: ReadStorage<Key, Value>,
|}): TryGetFunc<Key, Value> {
  return async (key: Key): Promise<?Value> => {
    const trackedChange = tryGetTracked(key);
    if (trackedChange != null) {
      if (trackedChange.type === 'delete') {
        return null;
      }

      return trackedChange.value;
    }

    const value = await readStorage.tryGet(key);
    return value;
  };
}

type BaseReadStorageCacheOptions<Key, Value> = {|
  readStorage: ReadStorage<Key, Value>,
  name: string,
  createAddChange: (value: Value) => AddChange,
  createDeleteChange?: (key: Key) => DeleteChange,
|};

class BaseReadStorageCache<Key, Value> {
  _readStorage: ReadStorage<Key, Value>;
  _name: string;
  +_tryGetTracked: (key: Key) => ?TrackedChange<Key, Value>;
  _createAddChange: (value: Value) => AddChange;
  _createDeleteChange: ?(key: Key) => DeleteChange;
  _values: { [key: string]: TrackedChange<Key, Value> };

  get: GetFunc<Key, Value>;
  tryGet: TryGetFunc<Key, Value>;

  constructor(options: BaseReadStorageCacheOptions<Key, Value>) {
    this._readStorage = options.readStorage;
    this._name = options.name;
    this._createAddChange = options.createAddChange;
    this._createDeleteChange = options.createDeleteChange;
    this._values = {};

    this.get = createGet({
      readStorage: this._readStorage,
      tryGetTracked: this._tryGetTracked.bind(this),
    });
    this.tryGet = createTryGet({
      readStorage: this._readStorage,
      tryGetTracked: this._tryGetTracked.bind(this),
    });
  }

  getChangeSet(): ChangeSet {
    const createDeleteChange = this._createDeleteChange;
    return utils.values(this._values).map(value => {
      if (value.type === 'delete') {
        if (createDeleteChange == null) {
          // TODO: Make better
          throw new Error('Invalid delete');
        }

        return { type: 'delete', change: createDeleteChange(value.key) };
      }

      return { type: 'add', change: this._createAddChange(value.value) };
    });
  }
}

type ReadStorageCacheOptions<Key, Value> = {|
  ...BaseReadStorageCacheOptions<Key, Value>,
  getKeyString: (key: Key) => string,
|};

class ReadStorageCache<Key, Value> extends BaseReadStorageCache<Key, Value> {
  _getKeyString: (key: Key) => string;

  constructor(options: ReadStorageCacheOptions<Key, Value>) {
    super({
      readStorage: options.readStorage,
      name: options.name,
      createAddChange: options.createAddChange,
      createDeleteChange: options.createDeleteChange,
    });
    this._getKeyString = options.getKeyString;
  }

  _tryGetTracked(key: Key): ?TrackedChange<Key, Value> {
    return this._values[this._getKeyString(key)];
  }
}

type ReadAllStorageCacheOptions<Key, Value> = {|
  readAllStorage: ReadAllStorage<Key, Value>,
  name: string,
  createAddChange: (value: Value) => AddChange,
  createDeleteChange?: (key: Key) => DeleteChange,
  getKeyString: (key: Key) => string,
  getKeyFromValue: (value: Value) => Key,
|};

class ReadAllStorageCache<Key, Value> extends ReadStorageCache<Key, Value> {
  _readAllStorage: ReadAllStorage<Key, Value>;
  _getKeyFromValue: (value: Value) => Key;
  all: Observable<Value>;

  constructor(options: ReadAllStorageCacheOptions<Key, Value>) {
    super({
      readStorage: {
        get: options.readAllStorage.get,
        tryGet: options.readAllStorage.tryGet,
      },
      name: options.name,
      getKeyString: options.getKeyString,
      createAddChange: options.createAddChange,
      createDeleteChange: options.createDeleteChange,
    });
    this._readAllStorage = options.readAllStorage;
    this._getKeyFromValue = options.getKeyFromValue;

    this.all = Observable.concat(
      Observable.defer(() =>
        Observable.of(
          ...utils
            .values(this._values)
            .map(value => (value.type === 'add' ? value.value : null))
            .filter(Boolean),
        ),
      ),
      this._readAllStorage.all.concatMap(value => {
        const trackedChange = this._tryGetTracked(this._getKeyFromValue(value));

        if (trackedChange != null && trackedChange.type === 'delete') {
          return Observable.of();
        }

        return Observable.of(value);
      }),
    );
  }
}

type ReadGetAllStorageCacheOptions<Key, PartialKey, Value> = {|
  readGetAllStorage: ReadGetAllStorage<Key, PartialKey, Value>,
  name: string,
  createAddChange: (value: Value) => AddChange,
  createDeleteChange?: (key: Key) => DeleteChange,
  getKeyString: (key: Key) => string,
  getKeyFromValue: (value: Value) => Key,
  matchesPartialKey: (value: Value, key: PartialKey) => boolean,
|};

class ReadGetAllStorageCache<Key, PartialKey, Value> extends ReadStorageCache<
  Key,
  Value,
> {
  _readGetAllStorage: ReadGetAllStorage<Key, PartialKey, Value>;
  _getKeyFromValue: (value: Value) => Key;
  _matchesPartialKey: (value: Value, key: PartialKey) => boolean;

  getAll: (key: PartialKey) => Observable<Value>;

  constructor(options: ReadGetAllStorageCacheOptions<Key, PartialKey, Value>) {
    super({
      readStorage: {
        get: options.readGetAllStorage.get,
        tryGet: options.readGetAllStorage.tryGet,
      },
      name: options.name,
      getKeyString: options.getKeyString,
      createAddChange: options.createAddChange,
      createDeleteChange: options.createDeleteChange,
    });
    this._readGetAllStorage = options.readGetAllStorage;
    this._getKeyFromValue = options.getKeyFromValue;
    this._matchesPartialKey = options.matchesPartialKey;

    this.getAll = (key: PartialKey): Observable<Value> => {
      const createdValues = utils
        .values(this._values)
        .map(
          value =>
            value.type === 'add' && this._matchesPartialKey(value.value, key)
              ? value.value
              : null,
        )
        .filter(Boolean);
      return Observable.concat(
        Observable.of(...createdValues),
        this._readGetAllStorage.getAll(key).concatMap(value => {
          const trackedChange = this._tryGetTracked(
            this._getKeyFromValue(value),
          );

          if (trackedChange != null && trackedChange.type === 'delete') {
            return Observable.of();
          }

          return Observable.of(value);
        }),
      );
    };
  }
}

type AddFunc<Value> = (value: Value, force?: boolean) => Promise<void>;

function createAdd<Key, Value>({
  cache,
  getKeyFromValue,
  getKeyString,
}: {|
  cache: ReadStorageCache<Key, Value>,
  getKeyFromValue: (value: Value) => Key,
  getKeyString: (key: Key) => string,
|}): AddFunc<Value> {
  return async (value: Value, force?: boolean): Promise<void> => {
    const key = getKeyFromValue(value);

    if (!force) {
      const currentValue = await cache.tryGet(key);
      if (currentValue != null) {
        // TODO: Better error
        throw new Error(
          `Attempted to add an already existing object for key ` +
            `${cache._name}:${getKeyString(key)}.`,
        );
      }
    }

    // eslint-disable-next-line
    cache._values[cache._getKeyString(key)] = { type: 'add', value };
  };
}

type UpdateFunc<Value, Update> = (
  value: Value,
  update: Update,
) => Promise<Value>;

function createUpdate<Key, Value, Update>({
  cache,
  update: updateFunc,
  getKeyFromValue,
}: {|
  cache: ReadStorageCache<Key, Value>,
  update: (value: Value, update: Update) => Value,
  getKeyFromValue: (value: Value) => Key,
|}): UpdateFunc<Value, Update> {
  return async (value: Value, update: Update): Promise<Value> => {
    const key = getKeyFromValue(value);

    const updatedValue = updateFunc(value, update);
    // eslint-disable-next-line
    cache._values[cache._getKeyString(key)] = {
      type: 'add',
      value: updatedValue,
    };

    return updatedValue;
  };
}

type DeleteFunc<Key> = (key: Key) => Promise<void>;

function createDelete<Key>({
  cache,
}: {|
  cache: ReadStorageCache<Key, *>,
|}): DeleteFunc<Key> {
  return async (key: Key): Promise<void> => {
    // eslint-disable-next-line
    cache._values[cache._getKeyString(key)] = { type: 'delete', key };
  };
}

type ReadAddUpdateDeleteStorageCacheOptions<Key, Value, Update> = {|
  ...ReadStorageCacheOptions<Key, Value>,
  update: (value: Value, update: Update) => Value,
  getKeyFromValue: (value: Value) => Key,
|};

export class ReadAddUpdateDeleteStorageCache<
  Key,
  Value,
  Update,
> extends ReadStorageCache<Key, Value> {
  add: AddFunc<Value>;
  update: UpdateFunc<Value, Update>;
  delete: DeleteFunc<Key>;

  constructor(
    options: ReadAddUpdateDeleteStorageCacheOptions<Key, Value, Update>,
  ) {
    super({
      readStorage: options.readStorage,
      name: options.name,
      getKeyString: options.getKeyString,
      createAddChange: options.createAddChange,
      createDeleteChange: options.createDeleteChange,
    });
    this.add = createAdd({
      cache: this,
      getKeyFromValue: options.getKeyFromValue,
      getKeyString: options.getKeyString,
    });
    this.update = createUpdate({
      cache: this,
      update: options.update,
      getKeyFromValue: options.getKeyFromValue,
    });
    this.delete = createDelete({ cache: this });
  }
}

type ReadAddUpdateStorageCacheOptions<Key, Value, Update> = {|
  ...ReadStorageCacheOptions<Key, Value>,
  update: (value: Value, update: Update) => Value,
  getKeyFromValue: (value: Value) => Key,
|};

export class ReadAddUpdateStorageCache<
  Key,
  Value,
  Update,
> extends ReadStorageCache<Key, Value> {
  add: AddFunc<Value>;
  update: UpdateFunc<Value, Update>;

  constructor(options: ReadAddUpdateStorageCacheOptions<Key, Value, Update>) {
    super({
      readStorage: options.readStorage,
      name: options.name,
      getKeyString: options.getKeyString,
      createAddChange: options.createAddChange,
      createDeleteChange: options.createDeleteChange,
    });
    this.add = createAdd({
      cache: this,
      getKeyFromValue: options.getKeyFromValue,
      getKeyString: options.getKeyString,
    });
    this.update = createUpdate({
      cache: this,
      update: options.update,
      getKeyFromValue: options.getKeyFromValue,
    });
  }
}

type ReadAddDeleteStorageCacheOptions<Key, Value> = {|
  ...ReadStorageCacheOptions<Key, Value>,
  getKeyFromValue: (value: Value) => Key,
|};

export class ReadAddDeleteStorageCache<Key, Value> extends ReadStorageCache<
  Key,
  Value,
> {
  add: AddFunc<Value>;
  delete: DeleteFunc<Key>;

  constructor(options: ReadAddDeleteStorageCacheOptions<Key, Value>) {
    super({
      readStorage: options.readStorage,
      name: options.name,
      getKeyString: options.getKeyString,
      createAddChange: options.createAddChange,
      createDeleteChange: options.createDeleteChange,
    });
    this.add = createAdd({
      cache: this,
      getKeyFromValue: options.getKeyFromValue,
      getKeyString: options.getKeyString,
    });
    this.delete = createDelete({ cache: this });
  }
}

type ReadAddStorageCacheOptions<Key, Value> = {|
  ...ReadStorageCacheOptions<Key, Value>,
  getKeyFromValue: (value: Value) => Key,
|};

export class ReadAddStorageCache<Key, Value> extends ReadStorageCache<
  Key,
  Value,
> {
  add: AddFunc<Value>;

  constructor(options: ReadAddStorageCacheOptions<Key, Value>) {
    super({
      readStorage: options.readStorage,
      name: options.name,
      getKeyString: options.getKeyString,
      createAddChange: options.createAddChange,
      createDeleteChange: options.createDeleteChange,
    });
    this.add = createAdd({
      cache: this,
      getKeyFromValue: options.getKeyFromValue,
      getKeyString: options.getKeyString,
    });
  }
}

type ReadGetAllAddUpdateDeleteStorageCacheOptions<
  Key,
  PartialKey,
  Value,
  Update,
> = {|
  ...ReadGetAllStorageCacheOptions<Key, PartialKey, Value>,
  update: (value: Value, update: Update) => Value,
  getKeyFromValue: (value: Value) => Key,
|};

export class ReadGetAllAddUpdateDeleteStorageCache<
  Key,
  PartialKey,
  Value,
  Update,
> extends ReadGetAllStorageCache<Key, PartialKey, Value> {
  add: AddFunc<Value>;
  update: UpdateFunc<Value, Update>;
  delete: DeleteFunc<Key>;

  constructor(
    options: ReadGetAllAddUpdateDeleteStorageCacheOptions<
      Key,
      PartialKey,
      Value,
      Update,
    >,
  ) {
    super({
      readGetAllStorage: options.readGetAllStorage,
      name: options.name,
      getKeyString: options.getKeyString,
      createAddChange: options.createAddChange,
      createDeleteChange: options.createDeleteChange,
      getKeyFromValue: options.getKeyFromValue,
      matchesPartialKey: options.matchesPartialKey,
    });
    this.add = createAdd({
      cache: this,
      getKeyFromValue: options.getKeyFromValue,
      getKeyString: options.getKeyString,
    });
    this.update = createUpdate({
      cache: this,
      update: options.update,
      getKeyFromValue: options.getKeyFromValue,
    });
    this.delete = createDelete({ cache: this });
  }
}

type ReadGetAllAddStorageCacheOptions<Key, PartialKey, Value> = {|
  ...ReadGetAllStorageCacheOptions<Key, PartialKey, Value>,
  getKeyFromValue: (value: Value) => Key,
|};

export class ReadGetAllAddStorageCache<
  Key,
  PartialKey,
  Value,
> extends ReadGetAllStorageCache<Key, PartialKey, Value> {
  add: AddFunc<Value>;

  constructor(
    options: ReadGetAllAddStorageCacheOptions<Key, PartialKey, Value>,
  ) {
    super({
      readGetAllStorage: options.readGetAllStorage,
      name: options.name,
      getKeyString: options.getKeyString,
      createAddChange: options.createAddChange,
      createDeleteChange: options.createDeleteChange,
      getKeyFromValue: options.getKeyFromValue,
      matchesPartialKey: options.matchesPartialKey,
    });
    this.add = createAdd({
      cache: this,
      getKeyFromValue: options.getKeyFromValue,
      getKeyString: options.getKeyString,
    });
  }
}

type ReadAllAddUpdateDeleteStorageCacheOptions<Key, Value, Update> = {|
  ...ReadAllStorageCacheOptions<Key, Value>,
  update: (value: Value, update: Update) => Value,
  getKeyFromValue: (value: Value) => Key,
|};

export class ReadAllAddUpdateDeleteStorageCache<
  Key,
  Value,
  Update,
> extends ReadAllStorageCache<Key, Value> {
  add: AddFunc<Value>;
  update: UpdateFunc<Value, Update>;
  delete: DeleteFunc<Key>;

  constructor(
    options: ReadAllAddUpdateDeleteStorageCacheOptions<Key, Value, Update>,
  ) {
    super({
      readAllStorage: options.readAllStorage,
      name: options.name,
      getKeyString: options.getKeyString,
      createAddChange: options.createAddChange,
      createDeleteChange: options.createDeleteChange,
      getKeyFromValue: options.getKeyFromValue,
    });
    this.add = createAdd({
      cache: this,
      getKeyFromValue: options.getKeyFromValue,
      getKeyString: options.getKeyString,
    });
    this.update = createUpdate({
      cache: this,
      update: options.update,
      getKeyFromValue: options.getKeyFromValue,
    });
    this.delete = createDelete({ cache: this });
  }
}

type ReadAllAddStorageCacheOptions<Key, Value> = {|
  ...ReadAllStorageCacheOptions<Key, Value>,
  getKeyFromValue: (value: Value) => Key,
|};

export class ReadAllAddStorageCache<Key, Value> extends ReadAllStorageCache<
  Key,
  Value,
> {
  add: AddFunc<Value>;

  constructor(options: ReadAllAddStorageCacheOptions<Key, Value>) {
    super({
      readAllStorage: options.readAllStorage,
      name: options.name,
      getKeyString: options.getKeyString,
      createAddChange: options.createAddChange,
      createDeleteChange: options.createDeleteChange,
      getKeyFromValue: options.getKeyFromValue,
    });
    this.add = createAdd({
      cache: this,
      getKeyFromValue: options.getKeyFromValue,
      getKeyString: options.getKeyString,
    });
  }
}

type BlockLikeKey = {|
  hashOrIndex: $PropertyType<Block, 'hash'> | $PropertyType<Block, 'index'>,
|};
type BlockLike = {
  +hash: $PropertyType<Block, 'hash'>,
  +index: $PropertyType<Block, 'index'>,
};

type BlockLikeStorageCacheOptions<Value: BlockLike> = {|
  ...BaseReadStorageCacheOptions<BlockLikeKey, Value>,
|};

export class BlockLikeStorageCache<
  Value: BlockLike,
> extends BaseReadStorageCache<BlockLikeKey, Value> {
  _create: (value: Value) => Value;
  _indexValues: { [index: string]: TrackedChange<BlockLikeKey, Value> };

  constructor(options: BlockLikeStorageCacheOptions<Value>) {
    super({
      readStorage: options.readStorage,
      name: options.name,
      createAddChange: options.createAddChange,
    });
    this._indexValues = {};
  }

  async add(value: Value, force?: boolean): Promise<void> {
    if (!force) {
      const currentValue = await this.tryGet({ hashOrIndex: value.index });
      if (currentValue != null) {
        // TODO: Better error
        throw new Error('Attempted to add an already existing object.');
      }
    }

    const addValue = { type: 'add', value };
    this._values[common.uInt256ToString(value.hash)] = addValue;
    this._indexValues[`${value.index}`] = addValue;
  }

  _tryGetTracked(key: BlockLikeKey): ?TrackedChange<BlockLikeKey, Value> {
    if (typeof key.hashOrIndex !== 'number') {
      return this._values[common.uInt256ToString(key.hashOrIndex)];
    }

    return this._indexValues[`${key.hashOrIndex}`];
  }
}
