export type WiFiInterface = "sta" | "ap";
export type ByteBuffer = ArrayBuffer | Uint8Array;
export interface ESPNowPacket extends ArrayBuffer {
  peerId: string;
  destination: string;
  broadcast: boolean;
  rssi: number;
  channel: number;
}
export interface SentEvent {
  peerId: string;
  success: boolean;
}
export interface ESPNowOptions {
  channel?: number;
  interface?: WiFiInterface | undefined;
  pmk?: ByteBuffer | undefined;
  receiveQueueLength?: number | undefined;
  format?: "buffer";
  target?: unknown;
  onReadable?: (this: ESPNow, count: number) => void;
  onSent?: (this: ESPNow, event: SentEvent) => void;
}
export interface PeerOptions {
  channel?: number;
  interface?: WiFiInterface | undefined;
  lmk?: ByteBuffer | undefined;
}
export interface PeerInfo {
  peerId: string;
  channel: number;
  interface: WiFiInterface;
  encrypted: boolean;
}
export interface ESPNowInfo {
  version: number;
  maxDataLength: number;
  channel: number;
  peerCount: number;
  encryptedPeerCount: number;
}

const nativeConstruct = native("xs_espnow_radio_constructor");
const nativeClose = native("xs_espnow_radio_close");
const nativeGetLocalID = native("xs_espnow_get_id");
const nativeGetID = native("xs_espnow_radio_get_id");
const nativeAddPeer = native("xs_espnow_radio_add_peer");
const nativeRemovePeer = native("xs_espnow_radio_remove_peer");
const nativeSend = native("xs_espnow_radio_send");
const nativeGetPeer = native("xs_espnow_radio_get_peer");
const nativeGetInfo = native("xs_espnow_radio_get_info");
const nativeConfigure = native("xs_espnow_radio_configure");

export const BROADCAST = "FFFFFFFFFFFF";

const addressPattern = /^(?:[0-9a-f]{12}|(?:[0-9a-f]{2}:){5}[0-9a-f]{2})$/i;

function address(value: string): string {
  if (value === BROADCAST) return value;
  if (typeof value !== "string" || !addressPattern.test(value))
    throw new RangeError(
      "MAC must be 12 hexadecimal digits or six colon-separated pairs",
    );
  return value.replaceAll(":", "").toUpperCase();
}

function bytes(value: unknown): ByteBuffer {
  if (!(value instanceof ArrayBuffer) && !(value instanceof Uint8Array))
    throw new TypeError("data must be an ArrayBuffer or Uint8Array");
  return value;
}

function key(value: unknown): ByteBuffer {
  const result = bytes(value);
  if (result.byteLength !== 16) throw new RangeError("key must be 16 bytes");
  return result;
}

function channel(value: unknown, allowCurrent = false): number {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < (allowCurrent ? 0 : 1) ||
    value > 14
  )
    throw new RangeError("invalid Wi-Fi channel");
  return value;
}

function networkInterface(value: WiFiInterface): number {
  if (value !== "sta" && value !== "ap")
    throw new RangeError("interface must be sta or ap");
  return value === "ap" ? 1 : 0;
}

class ESPNow extends (Native(
  "xs_espnow_radio_destructor",
) as new () => object) {
  #readable: ESPNowOptions["onReadable"];
  #sent: ESPNowOptions["onSent"];
  #packets: ESPNowPacket[] = [];
  #receiveQueueLength: number;
  #sending: string | undefined;
  #closed = false;
  #id: string;
  #interface: WiFiInterface;
  #maxDataLength: number;
  #lastPeer: string | undefined;
  #lastAddress: string | undefined;

  declare target?: unknown;
  declare [Symbol.dispose]: () => void;

  constructor(options: ESPNowOptions = {}) {
    super();
    this.#interface = options.interface ?? "sta";
    const interfaceIndex = networkInterface(this.#interface);
    const initialChannel = channel(options.channel ?? 0, true);
    const pmk = options.pmk === undefined ? undefined : key(options.pmk);
    for (const name of ["onReadable", "onSent"] as const) {
      if (options[name] !== undefined && typeof options[name] !== "function")
        throw new TypeError(`${name} must be a function`);
    }
    this.#receiveQueueLength = options.receiveQueueLength ?? 8;
    if (
      !Number.isInteger(this.#receiveQueueLength) ||
      this.#receiveQueueLength < 1
    )
      throw new RangeError("receiveQueueLength must be positive");
    this.#readable = options.onReadable;
    this.#sent = options.onSent;
    if ("target" in options) this.target = options.target;
    this.format = options.format ?? "buffer";
    let ready = false;
    try {
      // Native callbacks live on a private receiver, not on the public instance.
      nativeConstruct.call(
        this,
        { interface: interfaceIndex, offlineChannel: initialChannel, pmk },
        {
          onESPNowSent: (success: boolean) => this.#didSend(success),
          onESPNowReceive: (
            peerId: string,
            data: ArrayBuffer,
            destination: string,
            rssi: number,
            channel: number,
          ) => this.#didReceive(peerId, data, destination, rssi, channel),
        },
      );
      ready = true;
      this.#id = nativeGetID.call(this);
      // The local protocol version/length limit cannot change during this radio lifetime.
      this.#maxDataLength = nativeGetInfo.call(this).maxDataLength;
    } catch (error) {
      if (ready) nativeClose.call(this);
      throw error;
    }
  }

  #assertOpen() {
    if (this.#closed) throw new Error("ESP-NOW radio is closed");
  }

  get id() {
    this.#assertOpen();
    return this.#id;
  }
  get info(): ESPNowInfo {
    this.#assertOpen();
    return nativeGetInfo.call(this);
  }
  get writable() {
    this.#assertOpen();
    return this.#sending === undefined;
  }
  get format(): "buffer" {
    this.#assertOpen();
    return "buffer";
  }
  set format(value: "buffer") {
    this.#assertOpen();
    if (value !== "buffer")
      throw new RangeError("only buffer format is supported");
  }

  configure(options: { channel?: number; pmk?: ByteBuffer }) {
    this.#assertOpen();
    if (!this.writable) throw new Error("ESP-NOW send is pending");
    const configuration: { channel?: number; pmk?: ByteBuffer } = {};
    if ("channel" in options) configuration.channel = channel(options.channel);
    if ("pmk" in options) configuration.pmk = key(options.pmk);
    nativeConfigure.call(this, configuration);
  }

  addPeer(peerId: string, options: PeerOptions = {}) {
    this.#assertOpen();
    const normalized = address(peerId);
    const lmk = options.lmk === undefined ? undefined : key(options.lmk);
    if (lmk && normalized === BROADCAST)
      throw new RangeError("broadcast cannot be encrypted");
    nativeAddPeer.call(
      this,
      normalized,
      lmk,
      channel(options.channel ?? 0, true),
      networkInterface(options.interface ?? this.#interface),
    );
  }

  getPeer(peerId: string): PeerInfo | undefined {
    this.#assertOpen();
    const normalized = address(peerId);
    const peer = nativeGetPeer.call(this, normalized);
    return peer ? { peerId: normalized, ...peer } : undefined;
  }

  hasPeer(peerId: string): boolean {
    return this.getPeer(peerId) !== undefined;
  }

  removePeer(peerId: string) {
    this.#assertOpen();
    nativeRemovePeer.call(this, address(peerId));
  }

  read() {
    this.#assertOpen();
    return this.#packets.shift();
  }

  write(data: ByteBuffer, peerId: string = BROADCAST) {
    this.#assertOpen();
    if (!this.writable) throw new Error("ESP-NOW send is pending");
    let normalized: string;
    if (peerId === this.#lastPeer && this.#lastAddress !== undefined)
      normalized = this.#lastAddress;
    else {
      normalized = address(peerId);
      // Bound the cache to one destination, including long-lived broadcast streams.
      this.#lastPeer = peerId;
      this.#lastAddress = normalized;
    }
    const payload = bytes(data);
    if (payload.byteLength < 1 || payload.byteLength > this.#maxDataLength)
      throw new RangeError("invalid ESP-NOW frame length");
    this.#sending = normalized;
    try {
      nativeSend.call(this, normalized, payload);
    } catch (error) {
      this.#sending = undefined;
      throw error;
    }
  }

  #didSend(success: boolean) {
    if (this.#closed || this.#sending === undefined) return;
    const peerId = this.#sending;
    this.#sending = undefined;
    this.#sent?.call(this, { peerId, success });
  }

  #didReceive(
    peerId: string,
    data: ArrayBuffer,
    destination: string,
    rssi: number,
    channel: number,
  ) {
    if (this.#closed || this.#packets.length >= this.#receiveQueueLength)
      return;
    const packet = Object.assign(data, {
      peerId,
      destination,
      broadcast: destination === BROADCAST,
      rssi,
      channel,
    });
    this.#packets.push(packet);
    this.#readable?.call(this, this.#packets.length);
  }

  close() {
    if (this.#closed) return;
    this.#closed = true;
    this.#packets.length = 0;
    this.#sending = undefined;
    this.#readable = undefined;
    this.#sent = undefined;
    nativeClose.call(this);
  }

  static {
    ESPNow.prototype[Symbol.dispose] = ESPNow.prototype.close;
  }
}

export function getESPNowId(): string {
  return nativeGetLocalID.call(undefined);
}
export default ESPNow;
