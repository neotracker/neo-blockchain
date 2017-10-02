/* @flow */
import { INVOCATION_RESULT_TYPE } from './InvocationResultType';
import { type BinaryWriter } from '../utils';
import type {
  DeserializeWireBaseOptions,
  SerializableJSON,
  SerializeJSONContext,
} from '../Serializable';
import InvocationResultBase from './InvocationResultBase';
import { InvalidFormatError } from '../errors';

export type InvocationResultErrorAdd = {|
  message: string,
|};

export type InvocationResultErrorJSON = {|
  type: 'Error',
  message: string,
|};

const MAX_SIZE = 1024;

export default class InvocationResultError
  extends InvocationResultBase<typeof INVOCATION_RESULT_TYPE.ERROR>
  implements SerializableJSON<InvocationResultErrorJSON> {
  type = INVOCATION_RESULT_TYPE.ERROR;
  message: string;

  constructor({ message }: InvocationResultErrorAdd) {
    super();
    this.message = message;
  }

  serializeWireBase(writer: BinaryWriter): void {
    super.serializeWireBase(writer);
    writer.writeVarString(this.message, MAX_SIZE);
  }

  // eslint-disable-next-line
  static deserializeWireBase(options: DeserializeWireBaseOptions): this {
    const { reader } = options;
    const { type } = super.deserializeInvocationResultWireBase(options);
    if (type !== INVOCATION_RESULT_TYPE.ERROR) {
      throw new InvalidFormatError();
    }
    const message = reader.readVarString(MAX_SIZE);
    return new this({ message });
  }

  // eslint-disable-next-line
  serializeJSON(context: SerializeJSONContext): InvocationResultErrorJSON {
    return {
      type: 'Error',
      message: this.message,
    };
  }
}
