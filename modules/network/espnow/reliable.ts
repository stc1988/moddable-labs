import type ESPNow from "espnow";
import type { ReceiveEvent } from "espnow";
import type { ByteBuffer } from "espnow/core";
import Timer from "timer";

export interface CommandEvent {
  peerId: string;
  data: ArrayBuffer;
  sessionId: number;
  sequence: number;
}
export interface ReliableOptions {
  radio: Pick<ESPNow, "send" | "info">;
  sessionId: number;
  ackTimeout?: number;
  retries?: number;
  queueLimit?: number;
  receiveSessionLimit?: number;
  onCommand?: (
    this: ReliableESPNow,
    event: CommandEvent,
  ) => void | Promise<void>;
}
interface Command {
  peerId: string;
  frame: ArrayBuffer;
  sequence: number;
  attempts: number;
  resolve: () => void;
  reject: (error: unknown) => void;
}
interface ReceivedSession {
  sequence: number;
  processing: boolean;
}
const HEADER = 16;
const MAGIC = 0x454e4f57; // "ENOW"
const DATA = 1;
const ACK = 2;

function integer(
  value: number,
  minimum: number,
  maximum: number,
  name: string,
) {
  if (!Number.isInteger(value) || value < minimum || value > maximum)
    throw new RangeError(`invalid ${name}`);
  return value;
}

// A separate, opt-in wire protocol. Raw ESP-NOW frames stay unchanged.
export default class ReliableESPNow {
  #radio: ReliableOptions["radio"];
  #session: number;
  #sequence = 0;
  #timeout: number;
  #retries: number;
  #limit: number;
  #receiveLimit: number;
  #receive: ReliableOptions["onCommand"];
  #sessions = new Map<string, ReceivedSession>();
  #queue: Command[] = [];
  #current: Command | undefined;
  #timer: Timer | undefined;
  #closed = false;
  #maxLength: number;

  declare [Symbol.dispose]: () => void;

  constructor(options: ReliableOptions) {
    this.#radio = options.radio;
    this.#session = integer(options.sessionId, 1, 0xffffffff, "sessionId");
    this.#timeout = integer(
      options.ackTimeout ?? 250,
      1,
      0x7fffffff,
      "ackTimeout",
    );
    this.#retries = integer(options.retries ?? 3, 0, 100, "retries");
    this.#limit = integer(options.queueLimit ?? 8, 1, 65535, "queueLimit");
    this.#receiveLimit = integer(
      options.receiveSessionLimit ?? 32,
      1,
      65535,
      "receiveSessionLimit",
    );
    this.#receive = options.onCommand;
    if (this.#receive !== undefined && typeof this.#receive !== "function")
      throw new TypeError("onCommand must be a function");
    this.#maxLength = Math.min(250, this.#radio.info.maxDataLength) - HEADER;
  }

  get pending() {
    return this.#queue.length + (this.#current ? 1 : 0);
  }

  send(peerId: string, data: ByteBuffer): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.#closed) throw new Error("reliable ESP-NOW is closed");
      if (this.pending >= this.#limit) throw new Error("command queue is full");
      if (
        typeof peerId !== "string" ||
        !/^(?:[0-9a-f]{12}|(?:[0-9a-f]{2}:){5}[0-9a-f]{2})$/i.test(peerId)
      )
        throw new RangeError("invalid peer MAC");
      const destination = peerId.replaceAll(":", "").toUpperCase();
      // Only individual unicast destinations; never create broadcast ACK storms.
      if (Number.parseInt(destination.slice(0, 2), 16) & 1)
        throw new RangeError("commands require unicast");
      if (
        !(data instanceof ArrayBuffer) &&
        !(data instanceof SharedArrayBuffer) &&
        !(data instanceof Uint8Array) &&
        !(data instanceof Int8Array) &&
        !(data instanceof DataView)
      )
        throw new TypeError("data must be a Byte Buffer");
      if (!data.byteLength || data.byteLength > this.#maxLength)
        throw new RangeError("invalid command length");
      if (this.#sequence === 0xffffffff)
        throw new Error("command sequence exhausted; use a new sessionId");
      const sequence = ++this.#sequence;
      const frame = this.#frame(DATA, this.#session, sequence, data.byteLength);
      new Uint8Array(frame, HEADER).set(
        ArrayBuffer.isView(data)
          ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
          : new Uint8Array(data),
      );
      this.#queue.push({
        peerId: destination,
        frame,
        sequence,
        attempts: 0,
        resolve,
        reject,
      });
      this.#drain();
    });
  }

  // Route each raw receive event here; false means it is not this protocol.
  receive(event: ReceiveEvent): boolean {
    if (this.#closed || event.data.byteLength < HEADER) return false;
    const view = new DataView(event.data);
    if (view.getUint32(0) !== MAGIC || view.getUint8(4) !== 1) return false;
    const type = view.getUint8(5);
    if (event.broadcast || view.getUint16(6) || (type !== DATA && type !== ACK))
      return true;
    const sessionId = view.getUint32(8);
    const sequence = view.getUint32(12);
    if (!sessionId || !sequence) return true;
    if (type === ACK) {
      const current = this.#current;
      if (
        event.data.byteLength === HEADER &&
        current &&
        current.attempts > 0 &&
        current.peerId === event.peerId &&
        sessionId === this.#session &&
        sequence === current.sequence
      )
        this.#finish();
      return true;
    }
    if (
      event.data.byteLength <= HEADER ||
      event.data.byteLength > HEADER + this.#maxLength ||
      !this.#receive
    )
      return true;
    const key = `${event.peerId}/${sessionId}`;
    let state = this.#sessions.get(key);
    if (state) {
      if (sequence <= state.sequence) {
        if (!state.processing) this.#ack(event.peerId, sessionId, sequence);
        return true;
      }
      // One sender serializes commands. Do not overlap asynchronous handlers.
      if (state.processing) return true;
    } else {
      // Never evict duplicate history silently and risk executing an old command twice.
      if (this.#sessions.size >= this.#receiveLimit) return true;
      state = { sequence: 0, processing: false };
      this.#sessions.set(key, state);
    }
    const previous = state.sequence;
    state.sequence = sequence;
    state.processing = true;
    const received = state;
    let result: void | Promise<void>;
    try {
      result = this.#receive.call(this, {
        peerId: event.peerId,
        data: event.data.slice(HEADER),
        sessionId,
        sequence,
      });
    } catch {
      received.sequence = previous;
      received.processing = false;
      return true;
    }
    Promise.resolve(result).then(
      () => {
        received.processing = false;
        if (!this.#closed) this.#ack(event.peerId, sessionId, sequence);
      },
      () => {
        received.sequence = previous;
        received.processing = false;
      },
    );
    return true;
  }

  #frame(type: number, session: number, sequence: number, length = 0) {
    const frame = new ArrayBuffer(HEADER + length);
    const view = new DataView(frame);
    view.setUint32(0, MAGIC);
    view.setUint8(4, 1);
    view.setUint8(5, type);
    view.setUint32(8, session);
    view.setUint32(12, sequence);
    return frame;
  }

  #ack(peerId: string, session: number, sequence: number) {
    // Peer registration/keys belong to the application. A retry re-sends a lost ACK.
    this.#radio
      .send(peerId, this.#frame(ACK, session, sequence))
      .catch(() => {});
  }

  #drain() {
    if (this.#closed || this.#current) return;
    this.#current = this.#queue.shift();
    if (this.#current) this.#attempt(this.#current);
  }

  #attempt(command: Command) {
    command.attempts++;
    this.#radio.send(command.peerId, command.frame).then(
      () => {
        if (this.#current === command) this.#wait(command);
      },
      (error) => {
        if (this.#current !== command) return;
        if (command.attempts > this.#retries) this.#finish(error);
        else this.#wait(command);
      },
    );
  }

  #wait(command: Command) {
    this.#timer = Timer.set(() => {
      this.#timer = undefined;
      if (this.#current !== command || this.#closed) return;
      if (command.attempts > this.#retries)
        this.#finish(new Error("ESP-NOW application ACK timed out"));
      else this.#attempt(command);
    }, this.#timeout);
  }

  #finish(error?: unknown) {
    const current = this.#current;
    if (!current) return;
    Timer.clear(this.#timer);
    this.#timer = undefined;
    this.#current = undefined;
    if (error === undefined) current.resolve();
    else current.reject(error);
    this.#drain();
  }

  close() {
    if (this.#closed) return;
    this.#closed = true;
    Timer.clear(this.#timer);
    this.#timer = undefined;
    const error = new Error("reliable ESP-NOW is closed");
    this.#current?.reject(error);
    this.#current = undefined;
    for (const command of this.#queue) command.reject(error);
    this.#queue.length = 0;
    this.#sessions.clear();
    this.#receive = undefined;
  }

  static {
    ReliableESPNow.prototype[Symbol.dispose] = ReliableESPNow.prototype.close;
  }
}
