import type {
  ByteBuffer,
  ESPNowCoreOptions,
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
  sendTimeout?: number;
  onError?: (this: ESPNow, error: Error) => void;
  receiveQueueLength?: number | undefined;
  target?: unknown;
  onReceive?: (this: ESPNow, event: ReceiveEvent) => void;
}

import WiFi from "embedded:network/interface/wifi";
import ESPNowCore, { BROADCAST } from "espnow/core";
import Timer from "timer";

interface PendingSend {
  peerId: string;
  latestKey?: string;
  data: ArrayBuffer;
  resolve: () => void;
  reject: (reason: unknown) => void;
}

function snapshot(data: ByteBuffer): ArrayBuffer {
  return ArrayBuffer.isView(data)
    ? new Uint8Array(
        new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
      ).buffer
    : new Uint8Array(new Uint8Array(data)).buffer;
}

function destination(peerId: string | undefined): string {
  if (peerId === undefined) return BROADCAST;
  if (
    typeof peerId !== "string" ||
    !/^(?:[0-9a-f]{12}|(?:[0-9a-f]{2}:){5}[0-9a-f]{2})$/i.test(peerId)
  )
    throw new RangeError("invalid peer MAC");
  return peerId.replaceAll(":", "").toUpperCase();
}

export default class ESPNow {
  #radio!: ESPNowCore;
  #wifi: WiFi | undefined;
  #receive: ESPNowOptions["onReceive"];
  #queue: PendingSend[] = [];
  #current: PendingSend | undefined;
  #closed = false;
  #queueLimit: number;
  #maxDataLength!: number;
  #sendTimeout: number;
  #timer: Timer | undefined;
  #fault: Error | undefined;
  #error: ESPNowOptions["onError"];
  #coreOptions!: ESPNowCoreOptions;
  #peers = new Map<string, PeerOptions>();

  declare target?: unknown;
  declare [Symbol.dispose]: () => void;

  constructor(options: ESPNowOptions = {}) {
    this.#receive = options.onReceive;
    this.#error = options.onError;
    this.#sendTimeout = options.sendTimeout ?? 2000;
    if (
      !Number.isInteger(this.#sendTimeout) ||
      this.#sendTimeout < 1 ||
      this.#sendTimeout > 0x7fffffff
    )
      throw new RangeError("sendTimeout must be 1..2147483647 ms");
    if (this.#error !== undefined && typeof this.#error !== "function")
      throw new TypeError("onError must be a function");
    this.#queueLimit = options.queueLimit ?? 32;
    if (!Number.isInteger(this.#queueLimit) || this.#queueLimit < 1)
      throw new RangeError("queueLimit must be positive");
    if (this.#receive !== undefined && typeof this.#receive !== "function")
      throw new TypeError("onReceive must be a function");
    if ("target" in options) this.target = options.target;
    try {
      if (options.manageWiFi !== false)
        this.#wifi = new WiFi({ onChanged() {} });
      this.#coreOptions = {
        channel:
          options.channel ??
          options.offlineChannel ??
          (options.manageWiFi === false ? 0 : 1),
        interface: options.interface,
        pmk: options.pmk,
        receiveQueueLength: options.receiveQueueLength,
      };
      this.#openRadio();
      // Retain owned key bytes for explicit recovery, never caller-owned views.
      if (options.pmk !== undefined)
        this.#coreOptions.pmk = snapshot(options.pmk);
    } catch (error) {
      this.#radio?.close();
      this.#wifi?.close();
      throw error;
    }
  }

  #openRadio() {
    const owner = this;
    const radio = new ESPNowCore({
      ...this.#coreOptions,
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
          if (owner.#closed || owner.#fault) break;
          packet = this.read();
        }
      },
      onSent({ success }) {
        owner.#didSend(success);
      },
    });
    try {
      for (const [peerId, options] of this.#peers)
        radio.addPeer(peerId, options);
      this.#maxDataLength = radio.info.maxDataLength;
      this.#radio = radio;
    } catch (error) {
      radio.close();
      throw error;
    }
  }

  get faulted() {
    return this.#fault !== undefined;
  }

  // Pending work is never replayed: the remote application may already have acted.
  recover() {
    if (this.#closed) throw new Error("ESP-NOW radio is closed");
    if (!this.#fault) return;
    this.#openRadio();
    this.#fault = undefined;
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
    if (options.channel !== undefined)
      this.#coreOptions.channel = options.channel;
    if (options.pmk !== undefined)
      this.#coreOptions.pmk = snapshot(options.pmk);
  }

  addPeer(peerId: string, options: PeerOptions | ByteBuffer = {}) {
    const peerOptions =
      options instanceof ArrayBuffer ||
      options instanceof SharedArrayBuffer ||
      ArrayBuffer.isView(options)
        ? { lmk: options }
        : options;
    this.#radio.addPeer(peerId, peerOptions);
    const peer = this.#radio.getPeer(peerId);
    if (!peer) throw new Error("ESP-NOW peer registration was lost");
    this.#peers.set(destination(peerId), {
      channel: peer.channel,
      interface: peer.interface,
      ...(peerOptions.lmk === undefined
        ? {}
        : { lmk: snapshot(peerOptions.lmk) }),
    });
  }
  getPeer(peerId: string): PeerInfo | undefined {
    return this.#radio.getPeer(peerId);
  }
  hasPeer(peerId: string): boolean {
    return this.#radio.hasPeer(peerId);
  }
  removePeer(peerId: string) {
    this.#radio.removePeer(peerId);
    this.#peers.delete(destination(peerId));
  }

  send(peerId: string | undefined, data: ByteBuffer): Promise<void> {
    return this.#enqueue(peerId, data);
  }

  sendLatest(
    peerId: string | undefined,
    data: ByteBuffer,
    key = "",
  ): Promise<void> {
    return this.#enqueue(peerId, data, key);
  }

  #enqueue(
    peerId: string | undefined,
    data: ByteBuffer,
    latestKey?: string,
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (this.#closed) throw new Error("ESP-NOW radio is closed");
      if (this.#fault) throw this.#fault;
      if (latestKey !== undefined && typeof latestKey !== "string")
        throw new TypeError("key must be a string");
      const address = destination(peerId);
      const replace =
        latestKey === undefined
          ? -1
          : this.#queue.findIndex(
              (item) => item.peerId === address && item.latestKey === latestKey,
            );
      if (replace < 0 && this.pending >= this.#queueLimit)
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
      const item = {
        peerId: address,
        data: snapshot(data),
        latestKey,
        resolve,
        reject,
      };
      if (replace >= 0) {
        const previous = this.#queue.splice(replace, 1, item)[0];
        previous.reject(new Error("ESP-NOW send superseded by newer data"));
      } else this.#queue.push(item);
      this.#drain();
    });
  }

  #drain() {
    while (
      !this.#closed &&
      !this.#fault &&
      !this.#current &&
      this.#queue.length
    ) {
      const current = this.#queue.shift();
      if (!current) break;
      this.#current = current;
      try {
        this.#timer = Timer.set(() => {
          this.#timer = undefined;
          if (this.#current !== current || this.#closed) return;
          const error = new Error(
            "ESP-NOW send completion timed out; call recover()",
          );
          this.#fault = error;
          this.#rejectPending(error);
          this.#radio.close();
          this.#error?.call(this, error);
        }, this.#sendTimeout);
        this.#radio.write(current.data, current.peerId);
      } catch (error) {
        Timer.clear(this.#timer);
        this.#timer = undefined;
        this.#current = undefined;
        current.reject(error);
      }
    }
  }

  #didSend(success: boolean) {
    const current = this.#current;
    if (!current) return;
    Timer.clear(this.#timer);
    this.#timer = undefined;
    this.#current = undefined;
    if (success) current.resolve();
    else current.reject(new Error("ESP-NOW frame was not delivered"));
    this.#drain();
  }

  #rejectPending(error: Error) {
    this.#current?.reject(error);
    this.#current = undefined;
    for (const item of this.#queue) item.reject(error);
    this.#queue.length = 0;
  }

  close() {
    if (this.#closed) return;
    this.#closed = true;
    Timer.clear(this.#timer);
    this.#timer = undefined;
    this.#rejectPending(new Error("ESP-NOW radio is closed"));
    this.#receive = undefined;
    this.#error = undefined;
    this.#peers.clear();
    this.#coreOptions.pmk = undefined;
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
