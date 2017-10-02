/* @flow */
import type BigNumber from 'bignumber.js';
import type {
  ActionJSON,
  ActionTypeJSON,
  AccountJSON,
  AssetJSON,
  AssetNameJSON,
  AssetTypeJSON,
  AttributeJSON,
  BlockJSON,
  ClaimTransactionJSON,
  ContractJSON,
  ContractTransactionJSON,
  EnrollmentTransactionJSON,
  HeaderJSON,
  InputJSON,
  InvocationResultJSON,
  IssueTransactionJSON,
  InvocationTransactionJSON,
  LogActionJSON,
  MinerTransactionJSON,
  NotificationActionJSON,
  OutputJSON,
  PublishTransactionJSON,
  RegisterTransactionJSON,
  StorageItemJSON,
  TransactionJSON,
  ValidatorJSON,
  WitnessJSON,
  ContractParameterJSON,
  ContractParameterTypeJSON,
  SignatureContractParameterJSON,
  BooleanContractParameterJSON,
  IntegerContractParameterJSON,
  Hash160ContractParameterJSON,
  Hash256ContractParameterJSON,
  ByteArrayContractParameterJSON,
  PublicKeyContractParameterJSON,
  StringContractParameterJSON,
  ArrayContractParameterJSON,
  InteropInterfaceContractParameterJSON,
  VoidContractParameterJSON,
  UInt160,
  UInt160Hex,
  UInt256,
  UInt256Hex,
  PrivateKey,
  PrivateKeyHex,
} from 'neo-blockchain-core';

export type Action = ActionJSON;
export type ActionType = ActionTypeJSON;
export type Account = AccountJSON;
export type Asset = AssetJSON;
export type AssetName = AssetNameJSON;
export type AssetType = AssetTypeJSON;
export type Attribute = AttributeJSON;
export type Block = BlockJSON;
export type ClaimTransaction = ClaimTransactionJSON;
export type Contract = ContractJSON;
export type ContractTransaction = ContractTransactionJSON;
export type EnrollmentTransaction = EnrollmentTransactionJSON;
export type Header = HeaderJSON;
export type Input = InputJSON;
export type InvocationResult = InvocationResultJSON;
export type IssueTransaction = IssueTransactionJSON;
export type InvocationTransaction = InvocationTransactionJSON;
export type LogAction = LogActionJSON;
export type MinerTransaction = MinerTransactionJSON;
export type NotificationAction = NotificationActionJSON;
export type Output = OutputJSON;
export type PublishTransaction = PublishTransactionJSON;
export type RegisterTransaction = RegisterTransactionJSON;
export type StorageItem = StorageItemJSON;
export type Transaction = TransactionJSON;
export type Validator = ValidatorJSON;
export type Witness = WitnessJSON;
export type ContractParameter = ContractParameterJSON;
export type ContractParameterType = ContractParameterTypeJSON;
export type SignatureContractParameter = SignatureContractParameterJSON;
export type BooleanContractParameter = BooleanContractParameterJSON;
export type IntegerContractParameter = IntegerContractParameterJSON;
export type Hash160ContractParameter = Hash160ContractParameterJSON;
export type Hash256ContractParameter = Hash256ContractParameterJSON;
export type ByteArrayContractParameter = ByteArrayContractParameterJSON;
export type PublicKeyContractParameter = PublicKeyContractParameterJSON;
export type StringContractParameter = StringContractParameterJSON;
export type ArrayContractParameter = ArrayContractParameterJSON;
export type InteropInterfaceContractParameter = InteropInterfaceContractParameterJSON;
export type VoidContractParameter = VoidContractParameterJSON;

export type Hash160Like =
  UInt160 |
  UInt160Hex |
  Buffer |
  string;
export type Hash256Like =
  UInt256 |
  UInt256Hex |
  Buffer |
  string;
export type AddressLike = Hash160Like;
export type Number =
  number |
  string |
  BigNumber;
export type PrivateKeyLike =
  PrivateKey |
  PrivateKeyHex |
  Buffer |
  string;
export type TransactionOptions = {|
  privateKey: PrivateKeyLike,
|};

export type InputArg = {|
  txid: Hash256Like,
  index: number,
|};

export type OutputArg = {|
  address: AddressLike,
  asset: Hash256Like,
  value: Number,
|};
