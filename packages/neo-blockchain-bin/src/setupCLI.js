/* @flow */
import logger from './logger';

export default () => {
  const shutdownFuncs = [];
  const initiateShutdown = async () => {
    await Promise.all(shutdownFuncs.map(
      func => func(),
    ));
  };

  let shutdownInitiated = false;
  const shutdown = ({ exitCode }: { exitCode: number }) => {
    if (!shutdownInitiated) {
      shutdownInitiated = true;
      initiateShutdown()
        .then(() => process.exit(exitCode))
        .catch((error) => {
          logger.error('Error during shutdown.', error);
          process.exit(1);
        });
    }
  };

  process.on('unhandledRejection', (error) => {
    logger.error('Unhandled Rejection. Exiting.', error);
    shutdown({ exitCode: 1 });
  });

  process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception. Exiting.', error);
    shutdown({ exitCode: 1 });
  });

  return { shutdownFuncs, shutdown };
}
