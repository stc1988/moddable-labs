import assert from "node:assert/strict";
import { test } from "node:test";
import {
  calls,
  ESPNow,
  ESPNowCore,
  receivers,
  sent,
  state,
} from "./harness.mjs";

test("core requires options and validates them before native initialization", () => {
  const baseline = calls.length;
  for (const options of [undefined, null, 1, "options", false])
    assert.throws(() => new ESPNowCore(options), TypeError);
  for (const options of [{ onReadable: 1 }, { onSent: true }, { format: null }])
    assert.throws(() => new ESPNowCore(options));
  assert.equal(calls.length, baseline);
});

test("core reads options once, accepts frozen options and keeps callbacks private", () => {
  const reads = new Map();
  const target = {};
  let notifications = 0;
  const options = Object.freeze({
    target,
    onReadable() {
      notifications++;
    },
    onSent: null,
    io: "ignored",
    extra: "ignored",
  });
  const radio = new ESPNowCore(
    new Proxy(options, {
      get(object, name) {
        reads.set(name, (reads.get(name) ?? 0) + 1);
        return object[name];
      },
    }),
  );
  assert.ok([...reads.values()].every((count) => count === 1));
  assert.equal(reads.has("extra"), false);
  assert.equal(reads.has("io"), false);
  assert.equal(radio.target, target);
  assert.equal(radio.onReadable, undefined);
  receivers
    .get(radio)
    .onESPNowReceive(
      "AABBCCDDEEFF",
      new ArrayBuffer(1),
      "FFFFFFFFFFFF",
      -55,
      1,
    );
  assert.equal(notifications, 1);
  radio.close();
  assert.equal(radio[Symbol.dispose], radio.close);
  radio[Symbol.dispose]();
});

test("core copies a complete packet into caller buffers and preserves it after invalid reads", () => {
  const radio = new ESPNowCore({});
  receivers
    .get(radio)
    .onESPNowReceive(
      "AABBCCDDEEFF",
      Uint8Array.of(1, 2, 3).buffer,
      "FFFFFFFFFFFF",
      -55,
      6,
    );
  const small = Uint8Array.of(9, 9);
  assert.throws(() => radio.read(small), /too small/);
  assert.deepEqual([...small], [9, 9]);
  assert.throws(() => radio.read(3), TypeError);
  const storage = new Uint8Array(8).fill(9);
  const view = new DataView(storage.buffer, 2, 4);
  assert.equal(radio.read(view), 3);
  assert.deepEqual([...storage], [9, 9, 1, 2, 3, 9, 9, 9]);
  assert.equal(view.peerId, "AABBCCDDEEFF");
  assert.equal(view.destination, "FFFFFFFFFFFF");
  assert.equal(view.broadcast, true);
  assert.equal(view.rssi, -55);
  assert.equal(view.channel, 6);
  assert.equal(radio.read(view), undefined);
  assert.equal(radio.read(), undefined);
  for (const buffer of [
    new ArrayBuffer(3),
    new SharedArrayBuffer(3),
    new Uint8Array(3),
    new Int8Array(3),
  ]) {
    receivers
      .get(radio)
      .onESPNowReceive(
        "AABBCCDDEEFF",
        Uint8Array.of(4, 5, 6).buffer,
        "FFFFFFFFFFFF",
        -55,
        6,
      );
    assert.equal(radio.read(buffer), 3);
    assert.deepEqual([...new Uint8Array(buffer.buffer ?? buffer)], [4, 5, 6]);
  }
  radio.close();
  assert.throws(() => radio.read(view), /closed/);
});

test("core accepts standard byte buffers for writes and keys without changing view ranges", () => {
  const storage = Uint8Array.of(9, 1, 2, 8);
  const radio = new ESPNowCore({
    pmk: new DataView(new ArrayBuffer(20), 2, 16),
  });
  for (const data of [
    storage.buffer,
    new SharedArrayBuffer(2),
    storage.subarray(1, 3),
    new Int8Array(storage.buffer, 1, 2),
    new DataView(storage.buffer, 1, 2),
  ]) {
    radio.write(data);
    assert.equal(
      calls.filter((call) => call.name.endsWith("_send")).at(-1).args[1],
      data,
    );
    sent();
  }
  assert.throws(() => radio.write(new Uint16Array(2)), TypeError);
  radio.addPeer("AABBCCDDEEFF", { lmk: new Int8Array(16) });
  radio.removePeer("AABBCCDDEEFF");
  radio.close();
});

test("wrapper snapshots standard byte buffer views and shared buffers", async () => {
  const radio = new ESPNow();
  for (const makeView of [
    (storage) => new DataView(storage.buffer, 1, 2),
    (storage) => new Int8Array(storage.buffer, 1, 2),
    () => {
      const shared = new SharedArrayBuffer(2);
      new Uint8Array(shared).set([1, 2]);
      return shared;
    },
  ]) {
    const storage = Uint8Array.of(9, 1, 2, 8);
    const data = makeView(storage);
    const pending = radio.send(undefined, data);
    new Uint8Array(data.buffer ?? data).fill(99);
    assert.deepEqual(
      new Uint8Array(
        calls.filter((call) => call.name.endsWith("_send")).at(-1).args[1],
      ),
      Uint8Array.of(1, 2),
    );
    sent();
    await pending;
  }
  await assert.rejects(radio.send(undefined, new Uint16Array(2)), TypeError);
  radio.addPeer("AABBCCDDEEFF", new DataView(new ArrayBuffer(16)));
  radio.removePeer("AABBCCDDEEFF");
  radio.close();
});

test("core writes one packet synchronously and reports MAC completion separately", () => {
  let result;
  const target = {};
  const radio = new ESPNowCore({
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
  const radio = new ESPNowCore({
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
  assert.throws(() => new ESPNowCore({ format: "number" }), /buffer/);
  assert.throws(() => new ESPNowCore({ pmk: new Uint8Array(15) }), /16/);
  assert.throws(() => new ESPNowCore({ channel: 99 }), /channel/);
  const radio = new ESPNowCore({});
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
  const radio = new ESPNowCore({});
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
  const radio = new ESPNow({ queueLimit: 2 });
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
  const radio = new ESPNow({
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
  assert.throws(() => new ESPNow(), /native failure/);
  assert.equal(state.wifiClosed, baseline + 1);
  const radio = new ESPNow({ manageWiFi: false });
  radio.close();
  assert.equal(state.wifiClosed, baseline + 1);
});

test("streaming sends preserve offset views and ArrayBuffer snapshots without polling native info", async () => {
  const radio = new ESPNow();
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
    const core = new ESPNowCore({});
    assert.throws(() => core.write(new ArrayBuffer(251)), /length/);
    core.write(new ArrayBuffer(250));
    sent();
    core.close();
    const queued = new ESPNow();
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
