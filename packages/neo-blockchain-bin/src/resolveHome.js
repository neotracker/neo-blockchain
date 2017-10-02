/* @flow */
import os from 'os';
import path from 'path';

const home = os.homedir();

export default (value: string): string =>
  value.startsWith('~/')
    ? path.resolve(home, value.slice(2))
    : value;
