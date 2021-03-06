/* @flow */
import { JSONRPCClient, JSONRPCHttpProvider } from './json';

export { JSONRPCClient, JSONRPCHttpProvider } from './json';

export { default as Client } from './Client';

export const client = new JSONRPCClient(
  new JSONRPCHttpProvider('https://neotracker.io/rpc'),
);

export const testClient = new JSONRPCClient(
  new JSONRPCHttpProvider('https://testnet.neotracker.io/rpc'),
);

export type {
  Action,
  ActionType,
  Account,
  Asset,
  AssetName,
  AssetType,
  Attribute,
  Block,
  ClaimTransaction,
  Contract,
  ContractTransaction,
  EnrollmentTransaction,
  Header,
  Input,
  InvocationResult,
  IssueTransaction,
  InvocationTransaction,
  LogAction,
  MinerTransaction,
  NotificationAction,
  Output,
  PublishTransaction,
  RegisterTransaction,
  StorageItem,
  Transaction,
  Validator,
  Witness,
  ContractParameter,
  ContractParameterType,
  SignatureContractParameter,
  BooleanContractParameter,
  IntegerContractParameter,
  Hash160ContractParameter,
  Hash256ContractParameter,
  ByteArrayContractParameter,
  PublicKeyContractParameter,
  StringContractParameter,
  ArrayContractParameter,
  InteropInterfaceContractParameter,
  VoidContractParameter,
} from './types';
export type { ActionFilter, BlockFilter, GetActionsFilter } from './filter';
export type { JSONRPCProvider } from './json';
