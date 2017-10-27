/* @flow */
import type ConnectedPeer from './ConnectedPeer';
import type Peer from './Peer';

export type EventMessage<Message, PeerData> =
  | {|
      event: 'NETWORK_START',
      message: string,
    |}
  | {|
      event: 'NETWORK_STOP',
      message: string,
    |}
  | {|
      event: 'TCP_SERVER_LISTEN',
      message: string,
    |}
  | {|
      event: 'TCP_SERVER_ERROR',
      message: string,
      data: {| error?: Error |},
    |}
  | {|
      event: 'CONNECT_LOOP_START',
      message: string,
    |}
  | {|
      event: 'CONNECT_LOOP_ERROR',
      message: string,
      data: {| error?: Error |},
    |}
  | {|
      event: 'PEER_CONNECT_START',
      message: string,
    |}
  | {|
      event: 'PEER_CONNECT_ERROR',
      message: string,
      data: {| error?: Error |},
    |}
  | {|
      event: 'PEER_CONNECT_SUCCESS',
      message: string,
      extra: {| connectedPeer: ConnectedPeer<Message, PeerData> |},
    |}
  | {|
      event: 'PEER_ERROR',
      message: string,
      data: {| error?: Error |},
    |}
  | {|
      event: 'PEER_CLOSED',
      message: string,
      extra: {| peer: Peer<Message> | ConnectedPeer<Message, PeerData> |},
    |};

export type OnEvent<Message, PeerData> = (
  event: EventMessage<Message, PeerData>,
) => void;
