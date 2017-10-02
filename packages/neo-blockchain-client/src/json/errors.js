/* @flow */

export type JSONRPCErrorResponse = {|
  code: number,
  message: string,
  data?: Object,
|};

// eslint-disable-next-line
export class JSONRPCError extends Error {
  responseError: JSONRPCErrorResponse;

  constructor(responseError: JSONRPCErrorResponse) {
    super(responseError.message);
    this.responseError = responseError;
  }
}

export class InvalidRPCResponseError extends Error {
  constructor() {
    super('Did not receive valid rpc response');
  }
}

export class HTTPError extends Error {
  status: number;
  text: ?string;

  constructor(status: number, text: ?string) {
    let message = `HTTP Error ${status}`;
    if (text != null) {
      message = `${message}: ${text}`;
    }
    super(message)
    this.status = status;
    this.text = text;
  }
}
