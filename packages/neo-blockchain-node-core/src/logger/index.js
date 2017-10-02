/* @flow */
// $FlowFixMe
import { performance } from 'perf_hooks'; // eslint-disable-line

export type RequestLog = {|
  headers?: { 'set-cookie'?: Array<string>, [name: string]: string },
  httpVersion: string,
  originalUrl: string,
  query: { [name: string]: string },
|};
export type ResponseLog = {|
  status: number,
|};

type SerializableType =
  Array<?SerializableType> |
  { [key: string]: ?SerializableType } |
  ?string |
  ?number |
  ?boolean;
type Extra = { [key: string]: ?SerializableType };

export type LogMetaExtra = {
  type: 'extra',
  [key: string]: ?SerializableType,
};
export type LogMetaError = {|
  type: 'error',
  error: Error,
  extra?: Extra,
|};
export type LogMetaErrorBlob = {|
  type: 'errorBlob',
  message?: string,
  fileName?: string,
  lineNumber?: number,
  columnNumber?: number,
|};
export type LogMetaRequest = {|
  type: 'request',
  request: RequestLog,
  response: ResponseLog,
  durationMS: number,
|};
export type LogMetaRequestError = {|
  type: 'requestError',
  error: Error,
  request: RequestLog,
  response: ResponseLog,
  durationMS: number,
|};
export type LogMetaUnexpectedRequestError = {|
  type: 'unexpectedRequestError',
  error: Error,
  request: ?RequestLog,
  response: ?ResponseLog,
|};
export type LogMetaProfile = {|
  type: 'profile',
  point: string,
  durationMS: number,
  extra: ?Extra,
|};
export type LogMeta =
  LogMetaExtra |
  LogMetaError |
  LogMetaErrorBlob |
  LogMetaRequest |
  LogMetaRequestError |
  LogMetaUnexpectedRequestError |
  LogMetaProfile;

export type LogEvent =
  'REQUEST' |
  'REQUEST_ERROR' |
  'PROFILE' |
  'NETWORK_START' |
  'NETWORK_STOP' |
  'TCP_SERVER_LISTEN' |
  'TCP_SERVER_ERROR' |
  'CONNECT_LOOP_START' |
  'CONNECT_LOOP_ERROR' |
  'PEER_CONNECT_START' |
  'PEER_CONNECT_ERROR' |
  'PEER_CONNECT_SUCCESS' |
  'PEER_ERROR' |
  'PEER_CLOSED' |
  'NODE_START' |
  'NODE_STOP' |
  'RELAY_TRANSACTION_START' |
  'RELAY_TRANSACTION_SUCCESS' |
  'RELAY_TRANSACTION_ERROR' |
  'RELAY_MESSAGE' |
  'SEND_MESSAGE' |
  'MESSAGE_RECEIVED' |
  'MESSAGE_RECEIVED_ERROR' |
  'PERSIST_BLOCK_SUCCESS' |
  'PERSIST_BLOCK_ERROR' |
  'VM_STEP';
export type LogEventWithoutContext =
  'UNEXPECTED_REQUEST_ERROR' |
  'RPC_ERROR' |
  'SERVER_START' |
  'SERVER_LISTENING';

export type RPCLoggingContext = {|
  type: 'rpc',
  request: {
    id: string,
    start: number,
  },
  userAgent: string,
  identifier: string,
|};

export type NodeLoggingContext = {|
  type: 'node',
  identifier: string,
|};

export type BlockchainLoggingContext = {|
  type: 'blockchain',
  identifier: string,
|};

export type LoggingContext =
  RPCLoggingContext |
  NodeLoggingContext |
  BlockchainLoggingContext;

type LogLevel = 'error' | 'warn' | 'info' | 'verbose' | 'debug' | 'silly';
export type LogMessageWithContext = {|
  event: LogEvent,
  level?: LogLevel,
  message?: string,
  meta?: LogMeta,
  context: LoggingContext,
|};
export type LogMessageWithoutContext = {|
  event: LogEventWithoutContext | LogEventWithoutContext,
  level?: LogLevel,
  message?: string,
  meta?: LogMeta | LogMeta,
  context?: ?LoggingContext,
|};
export type LogMessage =
  LogMessageWithContext |
  LogMessageWithoutContext;

type Profiler = {
  stop: () => void,
};
type Point =
  'placeholder';
export type Profile = (
  point: Point,
  context: LoggingContext,
  extra?: Extra,
) => Profiler;
export type Logger = (
  logMessage: LogMessage,
  // Only used on server when logs must be flushed. This will be called once
  // they're flushed
  exitCallback?: () => void,
) => void;
const NULL_PROFILER = { stop: () => {} };
export function createProfile(
  log: Logger,
): Profile {
  return (
    point: Point,
    context: LoggingContext,
    extra?: Extra,
  ): Profiler => {
    if (
      process.env.BUILD_FLAG_IS_DEV ||
      process.env.BUILD_FLAG_IS_TEST ||
      process.env.BUILD_FLAG_IS_STAGING ||
      (extra != null && extra.force)
    ) {
      const start = performance.now();
      return {
        stop: () => {
          const durationMS = performance.now() - start;
          if (durationMS > 1) {
            log({
              event: 'PROFILE',
              level: 'info',
              message: `${point} took ${durationMS} ms`,
              meta: {
                type: 'profile',
                point,
                durationMS,
                extra,
              },
              context,
            });
          }
        },
      };
    }

    return NULL_PROFILER;
  };
}

export const getErrorEventBlob = (errorEvent: Object) => ({
  type: 'errorBlob',
  message: errorEvent.message,
  fileName: errorEvent.fileName,
  lineNumber: errorEvent.lineNumber,
  columnNumber: errorEvent.columnNumber,
});
