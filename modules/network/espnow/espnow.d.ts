declare module "espnow" {
  export const BROADCAST: "FFFFFFFFFFFF";
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
    interface?: WiFiInterface;
    pmk?: ByteBuffer;
    receiveQueueLength?: number;
    format?: "buffer";
    target?: unknown;
    onReadable?: (this: ESPNow, count: number) => void;
    onSent?: (this: ESPNow, event: SentEvent) => void;
  }
  export interface PeerOptions {
    channel?: number;
    interface?: WiFiInterface;
    lmk?: ByteBuffer;
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
  export function getESPNowId(): string;
  export default class ESPNow {
    constructor(options?: ESPNowOptions);
    target?: unknown;
    readonly id: string;
    readonly info: ESPNowInfo;
    readonly writable: boolean;
    format: "buffer";
    configure(options: { channel?: number; pmk?: ByteBuffer }): void;
    addPeer(peerId: string, options?: PeerOptions): void;
    getPeer(peerId: string): PeerInfo | undefined;
    hasPeer(peerId: string): boolean;
    removePeer(peerId: string): void;
    read(): ESPNowPacket | undefined;
    write(data: ByteBuffer, peerId?: string): void;
    close(): void;
    [Symbol.dispose](): void;
  }
}
