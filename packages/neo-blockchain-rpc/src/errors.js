/* @flow */
export class RPCError extends Error {
  code: number;
  data: ?Object;

  constructor(code: number, message: string, data?: ?Object) {
    super(message);
    this.code = code;
    this.data = data;
  }
}

export class RPCUnknownError extends Error {
  error: any;

  constructor(error: any) {
    super('Unknown RPC Error');
    this.error = error;
  }
}
