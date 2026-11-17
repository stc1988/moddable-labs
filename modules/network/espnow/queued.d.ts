declare module "espnow/queued" {
  import type {
    ByteBuffer,
    ESPNowInfo,
    PeerInfo,
    PeerOptions,
    WiFiInterface,
  } from "espnow";
  export interface ReceiveEvent {
    data: ArrayBuffer;
    peerId: string;
    destination: string;
    broadcast: boolean;
    rssi: number;
    channel: number;
  }
  export interface QueuedESPNowOptions {
    channel?: number;
    offlineChannel?: number;
    interface?: WiFiInterface;
    manageWiFi?: boolean;
    pmk?: ByteBuffer;
    queueLimit?: number;
    receiveQueueLength?: number;
    target?: unknown;
    onReceive?: (this: QueuedESPNow, event: ReceiveEvent) => void;
  }
  export default class QueuedESPNow {
    constructor(options?: QueuedESPNowOptions);
    target?: unknown;
    readonly id: string;
    readonly info: ESPNowInfo;
    readonly pending: number;
    configure(options: { channel?: number; pmk?: ByteBuffer }): void;
    addPeer(peerId: string, options?: PeerOptions | ByteBuffer): void;
    getPeer(peerId: string): PeerInfo | undefined;
    hasPeer(peerId: string): boolean;
    removePeer(peerId: string): void;
    send(peerId: string | undefined, data: ByteBuffer): Promise<void>;
    close(): void;
    [Symbol.dispose](): void;
  }
}
