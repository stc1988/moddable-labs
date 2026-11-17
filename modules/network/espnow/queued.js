import WiFi from "embedded:network/interface/wifi";
import ESPNow, { BROADCAST } from "espnow";

export default class QueuedESPNow {
  #radio;
  #wifi;
  #receive;
  #queue = [];
  #current;
  #closed = false;
  #queueLimit;
  #maxDataLength;

  constructor(options = {}) {
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
      this.#radio = new ESPNow({
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

  configure(options) {
    if (this.pending) throw new Error("ESP-NOW sends are pending");
    this.#radio.configure(options);
  }

  addPeer(peerId, options = {}) {
    const peerOptions =
      options instanceof ArrayBuffer || options instanceof Uint8Array
        ? { lmk: options }
        : options;
    this.#radio.addPeer(peerId, peerOptions);
  }
  getPeer(peerId) {
    return this.#radio.getPeer(peerId);
  }
  hasPeer(peerId) {
    return this.#radio.hasPeer(peerId);
  }
  removePeer(peerId) {
    this.#radio.removePeer(peerId);
  }

  send(peerId, data) {
    return new Promise((resolve, reject) => {
      if (this.#closed) throw new Error("ESP-NOW radio is closed");
      if (this.pending >= this.#queueLimit)
        throw new Error("ESP-NOW send queue is full");
      if (!(data instanceof ArrayBuffer) && !(data instanceof Uint8Array))
        throw new TypeError("data must be an ArrayBuffer or Uint8Array");
      if (!data.byteLength || data.byteLength > this.#maxDataLength)
        throw new RangeError("invalid ESP-NOW frame length");
      // Snapshot exactly the supplied view, with one payload copy for either input type.
      const payload =
        data instanceof ArrayBuffer
          ? data.slice(0)
          : new Uint8Array(data).buffer;
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
      this.#current = current;
      try {
        this.#radio.write(current.data, current.peerId);
      } catch (error) {
        this.#current = undefined;
        current.reject(error);
      }
    }
  }

  #didSend(success) {
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
    QueuedESPNow.prototype[Symbol.dispose] = QueuedESPNow.prototype.close;
  }
}
