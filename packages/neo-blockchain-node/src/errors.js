/* @flow */
import type Message from './Message';

// eslint-disable-next-line
export class NegotiationError extends Error {
  messageObj: Message;

  constructor(message: Message) {
    super(
      `Negotiation failed. Unexpected message received: ${message.value.command}`
    );
    this.messageObj = message;
  }
}
