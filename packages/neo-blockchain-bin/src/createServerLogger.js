/* @flow */
import type {
  LogMessage,
} from 'neo-blockchain-node-core';

import _ from 'lodash';
import winston from 'winston';

const explodeError = (error: Error) => winston.exception.getAllInfo(error);

const isError = (event: string) =>
  event.toLowerCase().includes('error') ||
  event.toLowerCase().includes('failure');

const cleanValue = (value: mixed): mixed => {
  if (value == null) {
    return value;
  }

  if (Array.isArray(value)) {
    // eslint-disable-next-line
    return cleanArray(value);
  }

  if (value instanceof Error) {
    if (process.env.NODE_ENV === 'development') {
      // eslint-disable-next-line no-console
      console.error(value);
    }
    // eslint-disable-next-line
    return handleError(value);
  }

  if (typeof value === 'object' && value.constructor === Object) {
    // eslint-disable-next-line
    return cleanObject(value);
  }

  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value;
  }

  return null;
}

const cleanArray = (arr: Array<mixed>): ?Array<mixed> => {
  const result = arr.map(cleanValue).filter(Boolean);
  return result.length === 0 ? null : result;
}

const cleanObject = (obj: Object) => {
  const newObj = _.pickBy(
    _.mapValues(obj, cleanValue),
    val => val != null,
  );

  return _.isEmpty(newObj) ? null : newObj;
};

const handleError = (error: Error): Object => {
  let errorData = error.data == null ? null : error.data;
  if (
    error.originalError != null &&
    error.originalError instanceof Error
  ) {
    errorData = {
      ...(errorData || {}),
      originalError: handleError(error.originalError),
    };
  } else if (error.source != null) {
    errorData = { source: error.source };
  }
  return {
    error: explodeError(error),
    errorData,
  };
};

export default (
  log: {
    log: (
      level: string,
      event: string,
      message: ?(string | Object),
      data?: Object,
    ) => void
  },
) => (
  logMessage: LogMessage,
  exitCallback?: () => void,
) => {
  const { event, message, context } = logMessage;
  let level = logMessage.level;
  if (level == null) {
    level = isError(event) ? 'error' : 'info';
  }
  const meta = logMessage.meta;
  const data = cleanObject({ message, meta, context });

  let called = false;
  let onExit;
  if (exitCallback != null) {
    onExit = () => {
      if (called && exitCallback != null) {
        exitCallback();
      } else {
        called = true;
      }
    }
  }

  if (onExit == null) {
    if (data == null) {
      log.log(level, event);
    } else {
      log.log(level, event, data);
    }
  } else {
    // eslint-disable-next-line
    if (data == null) {
      log.log(level, event, onExit);
    } else {
      log.log(level, event, data, onExit);
    }
  }
};
