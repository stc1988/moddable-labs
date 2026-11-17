import assert from "node:assert/strict";
import { test } from "node:test";
import {
  calls,
  ESPNow,
  QueuedESPNow,
  receivers,
  sent,
  state,
} from "./harness.mjs";

test("core writes one packet synchronously and reports MAC completion separately", () => {
  let result;
  const target = {};
  const radio = new ESPNow({
    target,
    onSent(event) {
      result = { event, receiver: this };
    },
  });
  assert.equal(radio.target, target);
  assert.equal(radio.write(Uint8Array.of(1), "aa:bb:cc:dd:ee:ff"), undefined);
  assert.equal(radio.writable, false);
  assert.throws(() => radio.write(Uint8Array.of(2)), /pending/);
  assert.throws(() => radio.configure({ channel: 6 }), /pending/);
  receivers.get(radio).onESPNowSent(false);
  assert.equal(radio.writable, true);
  assert.deepEqual(result, {
    event: { peerId: "AABBCCDDEEFF", success: false },
    receiver: radio,
  });
  assert.equal(radio.onESPNowSent, undefined);
  assert.equal(radio.onESPNowReceive, undefined);
  radio.close();
});

test("core read returns metadata-bearing buffers, caps receive buffering and stops callbacks on close", () => {
  const counts = [];
  const radio = new ESPNow({
    receiveQueueLength: 1,
    onReadable(count) {
      assert.equal(this, radio);
      counts.push(count);
    },
  });
  const callback = receivers.get(radio);
  const data = new ArrayBuffer(4);
  callback.onESPNowReceive("AABBCCDDEEFF", data, "FFFFFFFFFFFF", -55, 6);
  callback.onESPNowReceive(
    "AABBCCDDEEFF",
    new ArrayBuffer(5),
    "FFFFFFFFFFFF",
    -56,
    6,
  );
  assert.deepEqual(counts, [1]);
  const packet = radio.read();
  assert.equal(packet, data);
  assert.equal(packet.peerId, "AABBCCDDEEFF");
  assert.equal(packet.broadcast, true);
  assert.equal(packet.rssi, -55);
  assert.equal(radio.read(), undefined);
  radio.close();
  radio.close();
  callback.onESPNowReceive("AABBCCDDEEFF", data, "FFFFFFFFFFFF", -55, 6);
  assert.deepEqual(counts, [1]);
  assert.throws(() => radio.read(), /closed/);
  assert.throws(() => radio.write(data), /closed/);
});

test("core validates formats, keys, channels and packet lengths", () => {
  assert.throws(() => new ESPNow({ format: "number" }), /buffer/);
  assert.throws(() => new ESPNow({ pmk: new Uint8Array(15) }), /16/);
  assert.throws(() => new ESPNow({ channel: 99 }), /channel/);
  const radio = new ESPNow();
  assert.equal(radio.format, "buffer");
  assert.throws(() => radio.write(new ArrayBuffer(1471)), /length/);
  assert.throws(() => radio.write([]), /ArrayBuffer/);
  assert.throws(() => radio.write(Uint8Array.of(1), "invalid"), /MAC/);
  state.failure = "xs_espnow_radio_send";
  assert.throws(() => radio.write(Uint8Array.of(1)), /native failure/);
  assert.equal(radio.writable, true);
  radio.close();
});

test("core keeps per-peer configuration separate and exposes no LMK", () => {
  const radio = new ESPNow();
  radio.addPeer("aa:bb:cc:dd:ee:ff", {
    channel: 6,
    interface: "ap",
    lmk: new Uint8Array(16),
  });
  assert.deepEqual(radio.getPeer("AABBCCDDEEFF"), {
    peerId: "AABBCCDDEEFF",
    encrypted: true,
    channel: 6,
    interface: "ap",
  });
  assert.throws(
    () => radio.addPeer("FFFFFFFFFFFF", { lmk: new Uint8Array(16) }),
    /broadcast/,
  );
  radio.removePeer("AABBCCDDEEFF");
  assert.equal(radio.hasPeer("AABBCCDDEEFF"), false);
  radio.close();
});

test("wrapper serializes and snapshots sends, bounds the queue and advances on failures", async () => {
  const radio = new QueuedESPNow({ queueLimit: 2 });
  const bytes = Uint8Array.of(1, 2);
  const baseline = calls.filter((c) => c.name.endsWith("_send")).length;
  const first = assert.rejects(radio.send(undefined, bytes), /not delivered/);
  const second = radio.send("AABBCCDDEEFF", bytes);
  bytes[0] = 99;
  await assert.rejects(radio.send(undefined, bytes), /full/);
  assert.equal(
    calls.filter((c) => c.name.endsWith("_send")).length,
    baseline + 1,
  );
  assert.deepEqual(
    new Uint8Array(
      calls.filter((c) => c.name.endsWith("_send")).at(-1).args[1],
    ),
    Uint8Array.of(1, 2),
  );
  sent(false);
  assert.equal(
    calls.filter((c) => c.name.endsWith("_send")).length,
    baseline + 2,
  );
  sent(true);
  await Promise.all([first, second]);
  assert.equal(radio.pending, 0);
  radio.close();
});

test("wrapper rejects pending sends on close, closes Wi-Fi and ignores later callbacks", async () => {
  let received = 0;
  const radio = new QueuedESPNow({
    onReceive() {
      received++;
    },
  });
  const first = assert.rejects(
    radio.send(undefined, Uint8Array.of(1)),
    /closed/,
  );
  const second = assert.rejects(
    radio.send(undefined, Uint8Array.of(2)),
    /closed/,
  );
  const callback = calls.filter((c) => c.name.endsWith("_constructor")).at(-1)
    .args[1];
  const baseline = state.wifiClosed;
  radio.close();
  radio.close();
  callback.onESPNowSent(true);
  callback.onESPNowReceive(
    "AABBCCDDEEFF",
    new ArrayBuffer(1),
    "FFFFFFFFFFFF",
    -42,
    1,
  );
  await Promise.all([first, second]);
  assert.equal(received, 0);
  assert.equal(state.wifiClosed, baseline + 1);
});

test("wrapper cleans up failed initialization and supports caller-owned Wi-Fi", () => {
  const baseline = state.wifiClosed;
  state.failure = "xs_espnow_radio_constructor";
  assert.throws(() => new QueuedESPNow(), /native failure/);
  assert.equal(state.wifiClosed, baseline + 1);
  const radio = new QueuedESPNow({ manageWiFi: false });
  radio.close();
  assert.equal(state.wifiClosed, baseline + 1);
});

test("streaming sends preserve offset views and ArrayBuffer snapshots without polling native info", async () => {
  const radio = new QueuedESPNow();
  const infoCalls = () =>
    calls.filter((c) => c.name.endsWith("_get_info")).length;
  const baseline = infoCalls();
  const storage = Uint8Array.of(9, 1, 2, 8);
  const first = radio.send("aa:bb:cc:dd:ee:ff", storage.subarray(1, 3));
  const buffer = Uint8Array.of(3, 4).buffer;
  const second = radio.send("aa:bb:cc:dd:ee:ff", buffer);
  storage.fill(99);
  new Uint8Array(buffer).fill(99);
  const lastPayload = () =>
    new Uint8Array(
      calls.filter((c) => c.name.endsWith("_send")).at(-1).args[1],
    );
  assert.deepEqual(lastPayload(), Uint8Array.of(1, 2));
  sent();
  assert.deepEqual(lastPayload(), Uint8Array.of(3, 4));
  sent();
  await Promise.all([first, second]);
  const third = radio.send(undefined, Uint8Array.of(5));
  sent();
  await third;
  assert.equal(infoCalls(), baseline);
  // Public info still reflects current peer registration.
  const before = radio.info.peerCount;
  radio.addPeer("112233445566");
  assert.equal(radio.info.peerCount, before + 1);
  radio.removePeer("112233445566");
  radio.close();
});

test("cached local frame limits still reject oversized v1 packets", async () => {
  state.maxDataLength = 250;
  try {
    const core = new ESPNow();
    assert.throws(() => core.write(new ArrayBuffer(251)), /length/);
    core.write(new ArrayBuffer(250));
    sent();
    core.close();
    const queued = new QueuedESPNow();
    await assert.rejects(
      queued.send(undefined, new ArrayBuffer(251)),
      /length/,
    );
    const accepted = queued.send(undefined, new ArrayBuffer(250));
    sent();
    await accepted;
    queued.close();
  } finally {
    delete state.maxDataLength;
  }
});
