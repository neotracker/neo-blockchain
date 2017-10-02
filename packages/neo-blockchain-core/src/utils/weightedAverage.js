/* @flow */
// TODO: Might be broken since we aren't using longs..
export default (input: Array<{|
  value: number,
  weight: number,
|}>): number => {
  let sumWeight = 0;
  let sumValue = 0;
  for (const value of input) {
    sumWeight += value.weight;
    sumValue += (value.value * value.weight);
  }

  if (sumValue === 0 || sumWeight === 0) {
    return 0;
  }
  return sumValue / sumWeight;
};
