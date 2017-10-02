/* @flow */
// TODO: Should just eliminate this to keep package size down
import async from 'async';

const promisify = (func: any) => (...args: any) => new Promise(
  (resolve, reject) => func(...args, (error, result) => {
    if (error != null) {
      reject(error);
    } else {
      resolve(result);
    }
  })
);

const promisifiedSome = promisify(async.some);

function some<T>(
  values: Array<T>,
  func: (value: T) => Promise<boolean>,
): Promise<boolean> {
  return promisifiedSome(values, async.asyncify(func));
}

export default {
  some,
};
