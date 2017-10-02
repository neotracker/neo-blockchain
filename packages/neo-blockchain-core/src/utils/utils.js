/* @flow */
import BN from 'bn.js';

import _ from 'lodash';

const USHORT_MAX_NUMBER = 65535;
const USHORT_MAX_NUMBER_PLUS_ONE = 65535 + 1;
const USHORT_MAX = new BN(USHORT_MAX_NUMBER);
const USHORT_MAX_PLUS_ONE = USHORT_MAX.addn(1);
const UINT_MAX_NUMBER = 4294967295;
const UINT_MAX = new BN(UINT_MAX_NUMBER);
const ZERO = new BN(0);
const ONE = new BN(1);
const NEGATIVE_ONE = new BN(-1);
const ONE_HUNDRED_MILLION = new BN(100000000);

const toSignedBuffer = (value: BN): Buffer => {
  const buff = value.toArrayLike(Buffer, 'le');
  if (value.isNeg()) {
    return buff;
  }

  return value.toArrayLike(Buffer, 'le', buff.length + 1);
};

const fromSignedBuffer = (value: Buffer): BN =>
  value.length === 0 ? ZERO : new BN(value, 'le').fromTwos(value.length * 8);

// TODO: This might be incorrect with the shenanigans we're doing above
const not = (value: BN): BN => value.notn(value.bitLength());

const getBoolean = (value: Buffer): boolean => value.some(byte => byte !== 0);

const booleanToBuffer = (value: boolean): Buffer =>
  Buffer.from([value ? 1 : 0]);

const toASCII = (bytes: Buffer) => {
  let result = '';
  for (let i = 0; i < bytes.length; i += 1) {
    result += String.fromCharCode(bytes.readUInt8(i));
  }

  return result;
};

const toUTF8 = (bytes: Buffer) => bytes.toString('utf8');

function keys<K>(obj: { [key: K]: any }): Array<K> {
  return (Object.keys(obj): $FlowFixMe);
}

function values<V>(obj: { [key: any]: V }): Array<V> {
  return (Object.values(obj): $FlowFixMe);
}

function entries<K, V>(obj: {[ key: K]: V }): Array<[K, V]> {
  return (Object.entries(obj): $FlowFixMe);
}

const reverse = (src: Buffer): Buffer => {
  const out = Buffer.allocUnsafe(src.length);
  for (let i = 0, j = src.length - 1; i <= j; i += 1, j -= 1) {
    out[i] = src[j]
    out[j] = src[i];
  }

  return out;
}

const calculateClaimAmount = async ({
  coins,
  decrementInterval,
  generationAmount,
  getSystemFee,
}: {|
  coins: Array<{|
    value: BN,
    startHeight: number,
    endHeight: number,
  |}>,
  decrementInterval: number,
  generationAmount: Array<number>,
  getSystemFee: (index: number) => Promise<BN>,
|}): Promise<BN> => {
  const grouped = values(_.groupBy(
    coins,
    coin => `${coin.startHeight}:${coin.endHeight}`,
  ));
  const claimed = await Promise.all(grouped
    .map(async (coinsGroup) => {
      const { startHeight, endHeight } =
        coinsGroup[0];

      let amount = ZERO;
      let ustart = Math.floor(startHeight / decrementInterval);
      if (ustart < generationAmount.length) {
        let istart = startHeight % decrementInterval;
        let uend = Math.floor(endHeight / decrementInterval);
        let iend = endHeight % decrementInterval;
        if (uend >= generationAmount.length) {
          uend = generationAmount.length;
          iend = 0;
        }

        if (iend === 0) {
          uend -= 1;
          iend = decrementInterval;
        }

        while (ustart < uend) {
          amount = amount.addn(
            (decrementInterval - istart) * generationAmount[ustart]
          );
          ustart += 1;
          istart = 0;
        }

        amount = amount.addn((iend - istart) * generationAmount[ustart]);
      }

      const [sysFeeEnd, sysFeeStart] = await Promise.all([
        getSystemFee(endHeight - 1),
        startHeight === 0
          ? Promise.resolve(ZERO)
          : getSystemFee(startHeight - 1),
      ]);

      amount = amount.add(sysFeeEnd.sub(sysFeeStart).div(ONE_HUNDRED_MILLION));
      const totalValue = coinsGroup.reduce(
        (acc, { value }) => acc.add(value),
        ZERO,
      );
      return [totalValue, amount];
    }),
  );

  return claimed.reduce(
    (acc, [value, amount]) => acc.add(
      value.div(ONE_HUNDRED_MILLION).mul(amount)
    ),
    ZERO,
  );
}

const randomUInt = (): number => Math.floor(Math.random() * UINT_MAX_NUMBER);

export default {
  FD: new BN(0xFD),
  FFFF: new BN(0xFFFF),
  FFFFFFFF: new BN(0xFFFFFFFF),
  ZERO,
  ONE,
  NEGATIVE_ONE,
  INT_MAX_VALUE: new BN(2147483647),
  SATOSHI: ONE,
  NEGATIVE_SATOSHI: NEGATIVE_ONE,
  USHORT_MAX_NUMBER,
  USHORT_MAX_NUMBER_PLUS_ONE,
  USHORT_MAX,
  USHORT_MAX_PLUS_ONE,
  UINT_MAX_NUMBER,
  UINT_MAX,
  ONE_HUNDRED_MILLION,
  EIGHT: new BN(8),
  TEN: new BN(10),
  SIXTEEN: new BN(16),
  toSignedBuffer,
  fromSignedBuffer,
  not,
  getBoolean,
  booleanToBuffer,
  toASCII,
  toUTF8,
  keys,
  values,
  entries,
  reverse,
  calculateClaimAmount,
  randomUInt,
};
