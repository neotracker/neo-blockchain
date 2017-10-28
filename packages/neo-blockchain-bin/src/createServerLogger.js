/* @flow */
import type { LogMessage } from 'neo-blockchain-node-core';

// flowlint-next-line untyped-type-import:off
import type winston from 'winston';

const isError = (event: string) =>
  event.toLowerCase().includes('error') ||
  event.toLowerCase().includes('failure');

const explodeError = (error: Error) => ({
  message: [error.message || '(no error message)', error.stack].join('\n'),
});

export default (logger: winston.Logger) => (
  logMessage: LogMessage,
  exitCallbackIn?: () => void,
) => {
  const { error } = logMessage;
  let { level } = logMessage;
  if (level == null) {
    level = isError(logMessage.event) || error != null ? 'error' : 'info';
  }
  let message = { ...logMessage, level };
  if (error != null) {
    message = { ...message, error: explodeError(error) };
  }

  logger.log(message);
  const exitCallback = exitCallbackIn;
  if (exitCallback != null) {
    const numFlushes = logger.transports.length;
    let numFlushed = 0;
    logger.transports.forEach(transport => {
      transport.once('finish', () => {
        numFlushed += 1;
        if (numFlushes === numFlushed) {
          exitCallback();
        }
      });

      transport.end();
    });
  }
};
