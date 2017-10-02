/* @flow */
import type { InvocationResult } from './InvocationResult';
import type { InvocationResultType } from './InvocationResultType';
import { BinaryReader, type BinaryWriter } from '../utils';
import {
  type DeserializeWireBaseOptions,
  type DeserializeWireOptions,
  type SerializeWire,
  type SerializableWire,
  createSerializeWire,
} from '../Serializable';

export default class InvocationResultBase<Type: InvocationResultType>
  implements SerializableWire<InvocationResult> {
  type: Type;

  serializeWireBase(writer: BinaryWriter): void {
    writer.writeUInt8(this.type);
  }

  serializeWire: SerializeWire = createSerializeWire(this.serializeWireBase.bind(this));

  // eslint-disable-next-line
  static deserializeInvocationResultWireBase({
    reader,
  }: DeserializeWireBaseOptions): {| type: number |} {
    const type = reader.readUInt8();
    return { type };
  }

  // eslint-disable-next-line
  static deserializeWireBase(options: DeserializeWireBaseOptions): this {
    throw new Error('Not Implemented');
  }

  static deserializeWire(options: DeserializeWireOptions): this {
    return this.deserializeWireBase({
      context: options.context,
      reader: new BinaryReader(options.buffer),
    });
  }
}
