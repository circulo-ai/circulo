import { EventEmitter } from "events";

export const streamEmitter = new EventEmitter();

export async function emitStreamEvent(chatId: string, data: any) {
  streamEmitter.emit(chatId, data);
}
