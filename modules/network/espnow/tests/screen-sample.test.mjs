import assert from "node:assert/strict";
import { test } from "node:test";
import { readTypeScript } from "./typescript.mjs";

test("screen sender and receiver exchange a sequence and show application reply", async () => {
  const radios = [];
  let timers = 0;
  globalThis.Behavior = class {};
  globalThis.Skin = globalThis.Style = class {};
  globalThis.Label = (data, options) => {
    const label = { ...options };
    if (options.anchor) data[options.anchor] = label;
    return label;
  };
  globalThis.Column = (_data, options) => options;
  globalThis.Application = {
    template: (render) =>
      class {
        constructor(data) {
          const options = render(data);
          this.behavior = new options.Behavior();
          this.behavior.onCreate(this, data);
        }
      },
  };
  globalThis.ESPNowSampleTimer = {
    repeat() {
      timers++;
      return {};
    },
    clear() {
      timers--;
    },
  };
  globalThis.ESPNowSampleRadio = class {
    id = radios.length === 0 ? "001122334455" : "AABBCCDDEEFF";
    pending = 0;
    info = { channel: 1, peerCount: 1 };
    peers = new Set();
    constructor(options) {
      this.options = options;
      radios.push(this);
    }
    hasPeer(peerId) {
      return this.peers.has(peerId);
    }
    addPeer(peerId) {
      this.peers.add(peerId);
    }
    send(peerId, data) {
      for (const radio of radios) {
        if (radio !== this && (!peerId || peerId === radio.id))
          queueMicrotask(() =>
            radio.options.onReceive({
              peerId: this.id,
              data,
              destination: peerId ?? "FFFFFFFFFFFF",
              broadcast: !peerId,
              rssi: -55,
              channel: 1,
            }),
          );
      }
      return Promise.resolve();
    }
    close() {
      this.closed = true;
    }
  };
  const source = (
    await readTypeScript(
      new URL(
        "../../../../examples/network/espnow/broadcast/shared/sample.ts",
        import.meta.url,
      ),
    )
  )
    .replace(/import ['"]piu\/MC['"]/, "")
    .replace(
      /import config from ['"]mc\/config['"]/,
      "const config = globalThis.ESPNowSampleConfig",
    )
    .replace(
      /import ESPNow from ['"]espnow['"]/,
      "const ESPNow = globalThis.ESPNowSampleRadio",
    )
    .replace(
      /import Timer from ['"]timer['"]/,
      "const Timer = globalThis.ESPNowSampleTimer",
    );
  const load = async (role) => {
    globalThis.ESPNowSampleConfig = { espnowSample: { role, channel: 1 } };
    return (
      await import(
        `data:text/javascript;base64,${Buffer.from(`${source}\n// ${role}`).toString("base64")}`
      )
    ).default;
  };
  // XS adds these embedded helpers; supply the same UTF-8 semantics in Node.
  ArrayBuffer.fromString = (text) => new TextEncoder().encode(text).buffer;
  String.fromArrayBuffer = (buffer) => new TextDecoder().decode(buffer);
  try {
    const sender = await load("sender");
    sender.behavior.onDisplaying(sender);
    const receiver = await load("receiver");
    receiver.behavior.onDisplaying(receiver);
    sender.behavior.tick();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(sender.behavior.sent, 1);
    assert.equal(receiver.behavior.received, 1);
    assert.equal(receiver.behavior.sent, 1);
    assert.equal(sender.behavior.received, 1);
    assert.match(sender.behavior.data.STATUS.string, /^Reply in \d+ ms$/);
    assert.match(receiver.behavior.data.SIGNAL.string, /-55 dBm/);
    assert.equal(sender.behavior.data.PAYLOAD.string, "PONG #1");
    assert.equal(receiver.behavior.data.PAYLOAD.string, "PING #1");
    sender.behavior.onUndisplaying();
    receiver.behavior.onUndisplaying();
    assert.equal(timers, 0);
    assert.ok(radios.every((radio) => radio.closed));
  } finally {
    delete ArrayBuffer.fromString;
    delete String.fromArrayBuffer;
  }
});
