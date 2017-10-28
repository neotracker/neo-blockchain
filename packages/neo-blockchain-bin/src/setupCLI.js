/* @flow */
import log from './log';

export default () => {
  const shutdownFuncs = [];
  const initiateShutdown = async () => {
    await Promise.all(shutdownFuncs.map(func => func()));
  };

  let shutdownInitiated = false;
  const shutdown = ({ exitCode }: { exitCode: number }) => {
    if (!shutdownInitiated) {
      shutdownInitiated = true;
      initiateShutdown()
        .then(() => {
          log({ event: 'SHUTDOWN_SUCCESS' }, () => process.exit(exitCode));
        })
        .catch(error => {
          log({ event: 'SHUTDOWN_ERROR', error }, () => process.exit(1));
        });
    }
  };

  process.on('unhandledRejection', error => {
    log({ event: 'UNHANDLED_REJECTION.', error });
    shutdown({ exitCode: 1 });
  });

  process.on('uncaughtException', error => {
    log({ event: 'UNCAUGHT_EXCEPTION', error });
    shutdown({ exitCode: 1 });
  });

  process.on('SIGINT', () => {
    shutdown({ exitCode: 0 });
  });

  return { shutdownFuncs, shutdown };
};
