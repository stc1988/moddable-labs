/* ESP-IDF examples/wifi/espnow port (Public Domain / CC0). See README.md. */
import type ESPNowCore from "espnow/core";
import type { ESPNowPacket, SentEvent } from "espnow/core";
import Timer from "timer";
import { BROADCAST, decode, encode } from "./protocol";

export interface ExchangeOptions {
  radio: Pick<ESPNowCore, "id" | "addPeer" | "write">;
  lmk: ArrayBuffer;
  channel: number;
  magic: number;
  length: number;
  count: number;
  delay: number;
  sendTimeout: number;
  log: (message: string) => void;
  onStop: (reason: string) => void;
}

export default class Exchange {
  #options: ExchangeOptions;
  #peer: string | undefined;
  #destination: string | undefined = BROADCAST;
  #state: 0 | 1 = 0;
  #sequence = [0, 0];
  #remaining: number;
  #inFlight: string | undefined;
  #next: Timer | undefined;
  #watchdog: Timer | undefined;
  #started = false;
  #closed = false;

  constructor(options: ExchangeOptions) {
    this.#options = options;
    this.#remaining = options.count;
  }

  get closed() {
    return this.#closed;
  }

  start() {
    if (this.#closed || this.#started) return;
    this.#started = true;
    this.#options.log(`START magic=${this.#options.magic}`);
    this.#schedule(5000);
  }

  receive(packet: ESPNowPacket) {
    if (this.#closed || packet.peerId === this.#options.radio.id) return;
    const frame = decode(packet);
    if (!frame || (frame.type === 0) !== packet.broadcast) {
      this.#options.log(
        `INVALID from=${packet.peerId} bytes=${packet.byteLength}`,
      );
      return;
    }
    // This is a two-device diagnostic. Bound discovery to one valid peer.
    if (this.#peer && this.#peer !== packet.peerId) return;
    if (!this.#peer) {
      if (!packet.broadcast) return;
      try {
        this.#options.radio.addPeer(packet.peerId, {
          channel: this.#options.channel,
          lmk: this.#options.lmk,
        });
      } catch (error) {
        this.stop(`addPeer failed: ${error}`);
        return;
      }
      this.#peer = packet.peerId;
      this.#options.log(`PEER ${packet.peerId} encrypted=true`);
    }
    this.#options.log(
      `RX ${packet.broadcast ? "broadcast" : "unicast"} from=${packet.peerId} seq=${frame.sequence} state=${frame.state} rssi=${packet.rssi}`,
    );
    if (packet.broadcast) {
      this.#state = 1;
      if (
        frame.state === 1 &&
        this.#options.magic >= frame.magic &&
        this.#destination === BROADCAST
      ) {
        this.#destination = this.#peer;
        this.#options.log(`SWITCH unicast to=${this.#peer}`);
        // A received broadcast may arrive while our broadcast is still in flight.
        if (this.#started && !this.#inFlight) this.#schedule(0);
      }
    } else if (this.#destination === BROADCAST) {
      this.#destination = undefined;
      Timer.clear(this.#next);
      this.#next = undefined;
      this.#options.log("LISTEN encrypted unicast");
    }
  }

  sent(event: SentEvent) {
    if (this.#closed || !this.#inFlight) return;
    if (event.peerId !== this.#inFlight) {
      this.stop("unexpected send completion peer");
      return;
    }
    const destination = this.#inFlight;
    this.#inFlight = undefined;
    Timer.clear(this.#watchdog);
    this.#watchdog = undefined;
    this.#options.log(`TX MAC to=${destination} success=${event.success}`);
    if (destination !== BROADCAST && --this.#remaining === 0) {
      this.stop("Send done (MAC results only)");
      return;
    }
    if (this.#destination) this.#schedule(this.#options.delay);
  }

  #schedule(delay: number) {
    Timer.clear(this.#next);
    this.#next = Timer.set(() => {
      this.#next = undefined;
      this.#send();
    }, delay);
  }

  #send() {
    if (this.#closed || this.#inFlight || !this.#destination) return;
    const destination = this.#destination;
    const type = destination === BROADCAST ? 0 : 1;
    const sequence = this.#sequence[type];
    this.#sequence[type] = (sequence + 1) & 0xffff;
    const data = encode(
      { type, state: this.#state, sequence, magic: this.#options.magic },
      this.#options.length,
    );
    this.#inFlight = destination;
    try {
      this.#watchdog = Timer.set(() => {
        this.#watchdog = undefined;
        this.stop("send completion timed out; restart both devices");
      }, this.#options.sendTimeout);
      this.#options.radio.write(data, destination);
    } catch (error) {
      this.stop(`write failed: ${error}`);
    }
  }

  stop(reason: string) {
    if (this.#closed) return;
    this.#closed = true;
    Timer.clear(this.#next);
    Timer.clear(this.#watchdog);
    this.#next = this.#watchdog = undefined;
    this.#inFlight = undefined;
    this.#options.onStop(reason);
  }
}
