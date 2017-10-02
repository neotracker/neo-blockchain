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
import {
  type ContractParameter,
  type ContractParameterJSON,
  deserializeWireBase as deserializeContractParameterWireBase,
} from '../contractParameter';

export type InvocationResultSuccessAdd = {|
  stack: Array<ContractParameter>,
  stackAlt: Array<ContractParameter>,
|};

export type InvocationResultSuccessJSON = {|
  type: 'Success',
  stack: Array<ContractParameterJSON>,
  stackAlt: Array<ContractParameterJSON>,
|};

export default class InvocationResultSuccess
  extends InvocationResultBase<typeof INVOCATION_RESULT_TYPE.SUCCESS>
  implements SerializableJSON<InvocationResultSuccessJSON> {
  type = INVOCATION_RESULT_TYPE.SUCCESS;
  stack: Array<ContractParameter>;
  stackAlt: Array<ContractParameter>;

  constructor({ stack, stackAlt }: InvocationResultSuccessAdd) {
    super();
    this.stack = stack;
    this.stackAlt = stackAlt;
  }

  serializeWireBase(writer: BinaryWriter): void {
    super.serializeWireBase(writer);
    writer.writeArray(
      this.stack,
      (contractParameter) => contractParameter.serializeWireBase(writer),
    );
    writer.writeArray(
      this.stackAlt,
      (contractParameter) => contractParameter.serializeWireBase(writer),
    );
  }

  // eslint-disable-next-line
  static deserializeWireBase(options: DeserializeWireBaseOptions): this {
    const { reader } = options;
    const { type } = super.deserializeInvocationResultWireBase(options);
    if (type !== INVOCATION_RESULT_TYPE.SUCCESS) {
      throw new InvalidFormatError();
    }
    const stack = reader.readArray(() => deserializeContractParameterWireBase(options));
    const stackAlt = reader.readArray(
      () => deserializeContractParameterWireBase(options),
    );
    return new this({ stack, stackAlt });
  }

  // eslint-disable-next-line
  serializeJSON(context: SerializeJSONContext): InvocationResultSuccessJSON {
    return {
      type: 'Success',
      stack: this.stack.map(value => value.serializeJSON(context)),
      stackAlt: this.stackAlt.map(value => value.serializeJSON(context)),
    };
  }
}
