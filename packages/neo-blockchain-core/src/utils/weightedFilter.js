/* @flow */

export default function weightedFilter<T>(
  input: Array<T>,
  start: number,
  end: number,
  getValue: (value: T) => number,
): Array<[T, number]> {
  const amount = input.reduce((acc, value) => acc + getValue(value), 0);
  let sum = 0;
  let current = 0;
  const result = [];
  for (const value of input) {
    if (current >= end) {
      break;
    }
    let weight = getValue(value);
    sum += weight;
    const old = current;
    current = sum / amount;
    if (current <= start) {
      // eslint-disable-next-line
      continue;
    }
    if (old < start) {
      if (current > end) {
        weight = ((end - start) * amount);
      } else {
        weight = ((current - start) * amount);
      }
    } else if (current > end) {
      weight = ((end - old) * amount);
    }

    result.push([value, weight >= 0 ? Math.floor(weight) : Math.ceil(weight)]);
  }

  return result;
}
