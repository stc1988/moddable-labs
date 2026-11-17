import type {
  ByteBuffer,
  ESPNowInfo,
  PeerInfo,
  PeerOptions,
  WiFiInterface,
} from "espnow/core";
export interface ReceiveEvent {
  data: ArrayBuffer;
  peerId: string;
  destination: string;
  broadcast: boolean;
  rssi: number;
  channel: number;
}
export interface ESPNowOptions {
  channel?: number;
  offlineChannel?: number;
  interface?: WiFiInterface | undefined;
  manageWiFi?: boolean;
  pmk?: ByteBuffer | undefined;
  queueLimit?: number;
  receiveQueueLength?: number | undefined;
  target?: unknown;
  onReceive?: (this: ESPNow, event: ReceiveEvent) => void;
}

import WiFi from "embedded:network/interface/wifi";
import ESPNowCore, { BROADCAST } from "espnow/core";

interface PendingSend {
  peerId: string;
  data: ArrayBuffer;
  resolve: () => void;
  reject: (reason: unknown) => void;
}

export default class ESPNow {
  #radio!: ESPNowCore;
  #wifi: WiFi | undefined;
  #receive: ESPNowOptions["onReceive"];
  #queue: PendingSend[] = [];
  #current: PendingSend | undefined;
  #closed = false;
  #queueLimit: number;
  #maxDataLength: number;

  declare target?: unknown;
  declare [Symbol.dispose]: () => void;

  constructor(options: ESPNowOptions = {}) {
    this.#receive = options.onReceive;
    this.#queueLimit = options.queueLimit ?? 32;
    if (!Number.isInteger(this.#queueLimit) || this.#queueLimit < 1)
      throw new RangeError("queueLimit must be positive");
    if (this.#receive !== undefined && typeof this.#receive !== "function")
      throw new TypeError("onReceive must be a function");
    if ("target" in options) this.target = options.target;
    try {
      if (options.manageWiFi !== false)
        this.#wifi = new WiFi({ onChanged() {} });
      const owner = this;
      this.#radio = new ESPNowCore({
        channel:
          options.channel ??
          options.offlineChannel ??
          (options.manageWiFi === false ? 0 : 1),
        interface: options.interface,
        pmk: options.pmk,
        receiveQueueLength: options.receiveQueueLength,
        onReadable() {
          let packet = this.read();
          while (packet !== undefined) {
            owner.#receive?.call(owner, {
              data: packet,
              peerId: packet.peerId,
              destination: packet.destination,
              broadcast: packet.broadcast,
              rssi: packet.rssi,
              channel: packet.channel,
            });
            if (owner.#closed) break;
            packet = this.read();
          }
        },
        onSent({ success }) {
          owner.#didSend(success);
        },
      });
      this.#maxDataLength = this.#radio.info.maxDataLength;
    } catch (error) {
      this.#radio?.close();
      this.#wifi?.close();
      throw error;
    }
  }

  get id() {
    return this.#radio.id;
  }
  get info() {
    return this.#radio.info;
  }
  get pending() {
    return this.#queue.length + (this.#current ? 1 : 0);
  }

  configure(options: { channel?: number; pmk?: ByteBuffer }) {
    if (this.pending) throw new Error("ESP-NOW sends are pending");
    this.#radio.configure(options);
  }

  addPeer(peerId: string, options: PeerOptions | ByteBuffer = {}) {
    const peerOptions =
      options instanceof ArrayBuffer ||
      options instanceof SharedArrayBuffer ||
      ArrayBuffer.isView(options)
        ? { lmk: options }
        : options;
    this.#radio.addPeer(peerId, peerOptions);
  }
  getPeer(peerId: string): PeerInfo | undefined {
    return this.#radio.getPeer(peerId);
  }
  hasPeer(peerId: string): boolean {
    return this.#radio.hasPeer(peerId);
  }
  removePeer(peerId: string) {
    this.#radio.removePeer(peerId);
  }

  send(peerId: string | undefined, data: ByteBuffer): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (this.#closed) throw new Error("ESP-NOW radio is closed");
      if (this.pending >= this.#queueLimit)
        throw new Error("ESP-NOW send queue is full");
      if (
        !(data instanceof ArrayBuffer) &&
        !(data instanceof SharedArrayBuffer) &&
        !(data instanceof Uint8Array) &&
        !(data instanceof Int8Array) &&
        !(data instanceof DataView)
      )
        throw new TypeError(
          "data must be an ArrayBuffer, SharedArrayBuffer, Uint8Array, Int8Array or DataView",
        );
      if (!data.byteLength || data.byteLength > this.#maxDataLength)
        throw new RangeError("invalid ESP-NOW frame length");
      // Snapshot exactly the supplied view, with one payload copy for either input type.
      const payload = ArrayBuffer.isView(data)
        ? new Uint8Array(
            new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
          ).buffer
        : new Uint8Array(new Uint8Array(data)).buffer;
      this.#queue.push({
        peerId: peerId ?? BROADCAST,
        data: payload,
        resolve,
        reject,
      });
      this.#drain();
    });
  }

  #drain() {
    while (!this.#closed && !this.#current && this.#queue.length) {
      const current = this.#queue.shift();
      if (!current) break;
      this.#current = current;
      try {
        this.#radio.write(current.data, current.peerId);
      } catch (error) {
        this.#current = undefined;
        current.reject(error);
      }
    }
  }

  #didSend(success: boolean) {
    const current = this.#current;
    if (!current) return;
    this.#current = undefined;
    if (success) current.resolve();
    else current.reject(new Error("ESP-NOW frame was not delivered"));
    this.#drain();
  }

  close() {
    if (this.#closed) return;
    this.#closed = true;
    const error = new Error("ESP-NOW radio is closed");
    this.#current?.reject(error);
    this.#current = undefined;
    for (const item of this.#queue) item.reject(error);
    this.#queue.length = 0;
    this.#receive = undefined;
    try {
      this.#radio.close();
    } finally {
      this.#wifi?.close();
    }
  }

  static {
    ESPNow.prototype[Symbol.dispose] = ESPNow.prototype.close;
  }
}
