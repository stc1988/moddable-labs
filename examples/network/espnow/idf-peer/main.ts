/* ESP-IDF examples/wifi/espnow port (Public Domain / CC0). See README.md. */
import WiFi from "embedded:network/interface/wifi";
import ESPNowCore from "espnow/core";
import config from "mc/config";
import Exchange from "./exchange";

interface Settings {
  channel?: number;
  magic?: number;
  length?: number;
  count?: number;
  delay?: number;
  sendTimeout?: number;
  pmk?: string;
  lmk?: string;
}
const settings: Settings = (config as { idfPeer?: Settings }).idfPeer ?? {};
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
function key(value: string) {
  if (typeof value !== "string") throw new TypeError("key must be a string");
  const data = ArrayBuffer.fromString(value);
  if (data.byteLength !== 16)
    throw new RangeError("key must be 16 UTF-8 bytes");
  return data;
}
const channel = integer(settings.channel ?? 1, 1, 14, "channel");
const magic = integer(
  settings.magic ?? Math.floor(Math.random() * 0x100000000),
  0,
  0xffffffff,
  "magic",
);
const length = integer(settings.length ?? 10, 10, 1470, "length");
const count = integer(settings.count ?? 100, 1, 65535, "count");
const delay = integer(settings.delay ?? 1000, 0, 65535, "delay");
const sendTimeout = integer(
  settings.sendTimeout ?? 2000,
  1,
  0x7fffffff,
  "sendTimeout",
);
// IDF example defaults, for isolated diagnostics only. Never print keys.
const pmk = key(settings.pmk ?? "pmk1234567890123");
const lmk = key(settings.lmk ?? "lmk1234567890123");

const wifi = new WiFi({ onChanged() {} });
let radio: ESPNowCore | undefined;
let exchange: Exchange | undefined;
try {
  radio = new ESPNowCore({
    channel,
    pmk,
    receiveQueueLength: 6,
    onReadable() {
      while (!exchange?.closed) {
        const packet = this.read();
        if (!packet) break;
        exchange?.receive(packet);
      }
    },
    onSent(event) {
      exchange?.sent(event);
    },
  });
  if (length > radio.info.maxDataLength)
    throw new RangeError("length exceeds local ESP-NOW limit");
  const activeRadio = radio;
  exchange = new Exchange({
    radio: activeRadio,
    channel,
    lmk,
    magic,
    length,
    count,
    delay,
    sendTimeout,
    log(message) {
      trace(`${message}\n`);
    },
    onStop(reason) {
      trace(`STOP ${reason}\n`);
      const info = activeRadio.info;
      trace(
        `STATS receivePending=${info.receivePending} receiveDropped=${info.receiveDropped} sendNotificationsDropped=${info.sendNotificationsDropped}\n`,
      );
      activeRadio.close();
      wifi.close();
    },
  });
  trace(
    `IDF peer example MAC=${radio.id} channel=${radio.info.channel} bytes=${length}\n`,
  );
  exchange.start();
} catch (error) {
  radio?.close();
  wifi.close();
  throw error;
}
