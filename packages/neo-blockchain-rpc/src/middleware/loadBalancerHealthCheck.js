/* @flow */
import { type Blockchain } from 'neo-blockchain-node-core';
import { type Context } from 'koa';

import _ from 'lodash';
import fetch from 'node-fetch';

export type LoadBalancerHealthCheckOptions = {|
  blockchain: Blockchain,
  rpcEndpoints: Array<string>,
|};

const TIMEOUT_MS = 5000;

const fetchCount = async (endpoint: string): Promise<?number> => {
  try {
    // eslint-disable-next-line
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify([{
        jsonrpc: '2.0',
        method: 'getblockcount',
        params: [],
        id: 4,
      }]),
      timeout: TIMEOUT_MS,
    });
    if (!response.ok) {
      return null;
    }
    // eslint-disable-next-line
    const result = await response.json();
    if (Array.isArray(result)) {
      const responseJSON = result[0]
      if (responseJSON.error || responseJSON.result == null) {
        return null;
      }
      return responseJSON.result;
    }

    return null;
  } catch (error) {
    return null;
  }
}

const fetchTallestBlockIndex = async (
  rpcEndpoints: Array<string>,
): Promise<?number> => {
  const counts = await Promise.all(rpcEndpoints.map(
    rpcEndpoint => fetchCount(rpcEndpoint),
  ));
  return _.max(counts
    .filter(Boolean)
    .map(count => count - 1)
  );
};

export default ({
  blockchain,
  rpcEndpoints,
}: LoadBalancerHealthCheckOptions) => async (ctx: Context): Promise<void> => {
  const index = await fetchTallestBlockIndex(rpcEndpoints);
  if (index == null || blockchain.currentBlockIndex === index) {
    ctx.status = 200;
  } else {
    ctx.status = 500;
  }
};
