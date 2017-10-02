/* @flow */
import {
  type BinaryWriter,
  type DeserializeWireBaseOptions,
  type DeserializeWireOptions,
  type SerializeWire,
  type SerializableWire,
  type UInt256,
  BinaryReader,
  InvalidFormatError,
  Witness,
  createSerializeWire,
} from 'neo-blockchain-core';

export type ConsensusPayloadAdd = {|
  version: number;
  previousHash: UInt256;
  blockIndex: number;
  validatorIndex: number;
  timestamp: number;
  data: Buffer;
  script: Witness;
|};

export default class ConsensusPayload
  implements SerializableWire<ConsensusPayload> {
  version: number;
  previousHash: UInt256;
  blockIndex: number;
  validatorIndex: number;
  timestamp: number;
  data: Buffer;
  script: Witness;

  constructor({
    version,
    previousHash,
    blockIndex,
    validatorIndex,
    timestamp,
    data,
    script,
  }: ConsensusPayloadAdd) {
    this.version = version;
    this.previousHash = previousHash;
    this.blockIndex = blockIndex;
    this.validatorIndex = validatorIndex;
    this.timestamp = timestamp;
    this.data = data;
    this.script = script;
  }

  serializeWireBase(writer: BinaryWriter): void {
    writer.writeUInt32LE(this.version);
    writer.writeUInt256(this.previousHash);
    writer.writeUInt32LE(this.blockIndex);
    writer.writeUInt16LE(this.validatorIndex);
    writer.writeUInt32LE(this.timestamp);
    writer.writeVarBytesLE(this.data);
    writer.writeUInt8(1);
    this.script.serializeWireBase(writer);
  }

  serializeWire: SerializeWire = createSerializeWire(this.serializeWireBase.bind(this));

  static deserializeWireBase(options: DeserializeWireBaseOptions): ConsensusPayload {
    const { reader } = options;
    const version = reader.readUInt32LE();
    const previousHash = reader.readUInt256();
    const blockIndex = reader.readUInt32LE();
    const validatorIndex = reader.readUInt16LE();
    const timestamp = reader.readUInt32LE();
    const data = reader.readVarBytesLE();
    if (reader.readUInt8() !== 1) {
      throw new InvalidFormatError();
    }
    const script = Witness.deserializeWireBase(options);

    return new this({
      version,
      previousHash,
      blockIndex,
      validatorIndex,
      timestamp,
      data,
      script,
    });
  }

  static deserializeWire(options: DeserializeWireOptions): this {
    return this.deserializeWireBase({
      context: options.context,
      reader: new BinaryReader(options.buffer),
    });
  }
}
