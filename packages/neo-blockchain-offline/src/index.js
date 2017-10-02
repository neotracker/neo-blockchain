/* @flow */
import { BlockTransform } from 'neo-blockchain-core';
import type { Blockchain } from 'neo-blockchain-node-core';
import { type Readable, type Writable } from 'stream';

import _ from 'lodash';
import fs from 'fs';
import zlib from 'zlib';

export type Chain = {|
  format: 'raw' | 'zip',
  path: string,
|};

const getStream = (chain: Chain): Readable => {
  const stream = fs.createReadStream(chain.path);
  if (chain.format === 'zip') {
    return stream.pipe(zlib.createUnzip());
  }

  return stream;
};

const getCount = async (stream: Readable): Promise<number> => {
  let count = stream.read(4);
  while (count == null) {
    // eslint-disable-next-line
    await new Promise((resolve) => setTimeout(() => resolve(), 250));
    count = stream.read(4);
  }

  // $FlowFixMe
  return count.readUInt32LE(0);
}

export const loadChain = async ({
  blockchain,
  chain,
}: {|
  blockchain: Blockchain,
  chain: Chain,
|}): Promise<void> => new Promise((resolve, reject) => {
  const stream = getStream(chain);
  const transform = new BlockTransform(blockchain.deserializeWireContext);

  const cleanup = () => {
    stream.unpipe(transform);
  };

  let resolved = false;
  let rejected = false;
  const onError = (error: Error) => {
    if (!resolved && !rejected) {
      rejected = true;
      cleanup();
      reject(error);
    }
  };

  const onEnd = () => {
    if (!resolved && !rejected) {
      resolved = true;
      cleanup();
      resolve();
    }
  };

  stream.once('error', onError);
  transform.once('finish', onEnd);
  transform.once('end', onEnd);
  transform.once('close', onEnd);
  transform.once('error', onError);

  // TODO: Not sure why I can't get this to work with a Writable stream so
  //       just implement janky custom backpressure control
  let pending = 0;
  let paused = false;
  transform.on('data', (block) => {
    pending += 1;
    blockchain.persistBlock({ block, unsafe: true }).then(() => {
      pending -= 1;
      if (pending < 500 && paused) {
        paused = false;
        transform.resume();
      }
    }).catch(onError);
    if (pending > 1000) {
      paused = true;
      transform.pause();
    }
  });

  getCount(stream).then(count => {
    if (count > blockchain.currentBlockIndex) {
      stream.pipe(transform);
    } else {
      resolved = true;
      // $FlowFixMe
      stream.destroy();
      resolve();
    }
  }).catch(reject);
});

const writeOut = async (
  blockchain: Blockchain,
  out: Writable,
  height: number,
): Promise<void> => {
  let processed = 0;
  let start = Date.now();
  for (const chunk of _.chunk(_.range(0, height), 10000)) {
    // eslint-disable-next-line
    const blocks = await Promise.all(chunk.map(
      index => blockchain.block.get({ hashOrIndex: index }),
    ));
    // eslint-disable-next-line
    blocks.forEach(block => {
      const buffer = block.serializeWire();
      const length = Buffer.alloc(4, 0);
      length.writeInt32LE(buffer.length, 0);
      out.write(length);
      out.write(buffer);
      processed += 1;
      if (processed >= 100000) {
        // eslint-disable-next-line
        console.log(
          `Processed ${processed} blocks in ${Date.now() - start} ms`
        );
        processed = 0;
        start = Date.now();
      }
    });
  }
  out.end();
}

export const dumpChain = async ({
  blockchain,
  path,
}: {
  blockchain: Blockchain,
  path: string,
}): Promise<void> => {
  const height = blockchain.currentBlockIndex;
  await new Promise((resolve, reject) => {
    const out = fs.createWriteStream(path);
    out.once('open', () => {
      const count = Buffer.alloc(4, 0);
      count.writeUInt32LE(height, 0);
      out.write(count);

      writeOut(blockchain, out, height).then(resolve, reject);
    });
  });
}
