/* @flow */
import type { LogMessage } from 'neo-blockchain-node-core';

const isError = (event: string) =>
  event.toLowerCase().includes('error') ||
  event.toLowerCase().includes('failure');

export default (log: { log: (value: Object) => void }) => (
  logMessage: LogMessage,
  exitCallback?: () => void,
) => {
  let level = logMessage.level;
  if (level == null) {
    level = isError(logMessage.event) ? 'error' : 'info';
  }

  log.log({ ...logMessage, level });
  // TODO: This needs to be called after all pipes have written the message.
  if (exitCallback != null) {
    exitCallback();
  }
};
