import assert from "node:assert/strict";
import { test } from "node:test";
import {
  calls,
  ESPNow,
  ESPNowCore,
  fireTimer,
  ReliableESPNow,
  receivers,
  sent,
  state,
  timers,
} from "./harness.mjs";

const payload = (n) => Uint8Array.of(n);
const latestCall = (suffix) =>
  calls.filter((c) => c.name.endsWith(suffix)).at(-1);
const flush = async () => {
  for (let n = 0; n < 8; n++) await Promise.resolve();
};

test("read releases native receive credits only after a successful complete read", () => {
  const radio = new ESPNowCore({ receiveQueueLength: 2 });
  assert.equal(latestCall("_constructor").args[0].receiveQueueLength, 2);
  const receive = receivers.get(radio).onESPNowReceive;
  receive("AABBCCDDEEFF", payload(1).buffer, "001122334455", -50, 1);
  const count = () =>
    calls.filter((c) => c.name.endsWith("consume_receive")).length;
  const baseline = count();
  assert.throws(() => radio.read(new ArrayBuffer(0)), /small/);
  assert.equal(count(), baseline);
  radio.read();
  assert.equal(count(), baseline + 1);
  radio.read();
  assert.equal(count(), baseline + 1);
  radio.close();
  assert.throws(() => new ESPNowCore({ receiveQueueLength: 65536 }), /65535/);
});

test("latest data replaces only matching queued stream, even at capacity", async () => {
  const radio = new ESPNow({ queueLimit: 3 });
  const first = radio.sendLatest("AABBCCDDEEFF", payload(1), "imu");
  const old = assert.rejects(
    radio.sendLatest("aa:bb:cc:dd:ee:ff", payload(2), "imu"),
    /superseded/,
  );
  const command = radio.send("AABBCCDDEEFF", payload(3));
  const newest = radio.sendLatest("AABBCCDDEEFF", payload(4), "imu");
  await assert.rejects(
    radio.sendLatest("112233445566", payload(5), "imu"),
    /full/,
  );
  assert.equal(radio.pending, 3);
  sent();
  assert.deepEqual([...new Uint8Array(latestCall("_send").args[1])], [4]);
  sent();
  assert.deepEqual([...new Uint8Array(latestCall("_send").args[1])], [3]);
  sent();
  await Promise.all([first, old, command, newest]);
  radio.close();
  assert.equal(timers.size, 0);
});

test("missing completion faults the radio; recovery restores copied keys and rejects stale completion", async () => {
  const pmk = new Uint8Array(16).fill(7);
  const lmk = new Uint8Array(16).fill(8);
  const failures = [];
  const radio = new ESPNow({
    pmk,
    sendTimeout: 50,
    onError(error) {
      assert.equal(this, radio);
      failures.push(error);
    },
  });
  radio.addPeer("AABBCCDDEEFF", { channel: 6, lmk });
  radio.configure({ channel: 6 });
  pmk.fill(99);
  lmk.fill(99);
  const old = latestCall("_constructor").args[1];
  const first = assert.rejects(
    radio.send("AABBCCDDEEFF", payload(1)),
    /timed out/,
  );
  const queued = assert.rejects(radio.send(undefined, payload(2)), /timed out/);
  assert.equal([...timers.values()][0].interval, 50);
  fireTimer();
  await Promise.all([first, queued]);
  assert.equal(radio.faulted, true);
  assert.equal(radio.pending, 0);
  assert.equal(failures.length, 1);
  await assert.rejects(radio.send(undefined, payload(3)), /recover/);
  state.failure = "xs_espnow_radio_add_peer";
  assert.throws(() => radio.recover(), /native failure/);
  assert.equal(radio.faulted, true);
  radio.recover();
  assert.equal(radio.faulted, false);
  const config = latestCall("_constructor").args[0];
  assert.equal(config.offlineChannel, 6);
  assert.equal(new Uint8Array(config.pmk)[0], 7);
  assert.equal(new Uint8Array(latestCall("add_peer").args[1])[0], 8);
  const next = radio.send("AABBCCDDEEFF", payload(4));
  old.onESPNowSent(true);
  assert.equal(radio.pending, 1);
  sent();
  await next;
  radio.close();
  assert.equal(timers.size, 0);
  assert.throws(() => radio.recover(), /closed/);
});

function endpoint(id) {
  const frames = [];
  return {
    id,
    frames,
    info: { maxDataLength: 1470 },
    send(peerId, data) {
      frames.push({ peerId, data: data.slice(0) });
      return Promise.resolve();
    },
  };
}
function event(from, to, data) {
  return {
    peerId: from.id,
    destination: to.id,
    broadcast: false,
    data,
    rssi: -50,
    channel: 1,
  };
}
function protocol(radio, options = {}) {
  return new ReliableESPNow({
    radio,
    sessionId: 123,
    ackTimeout: 10,
    ...options,
  });
}

test("lost ACK retries identical frame, receiver executes once and re-ACKs duplicates", async () => {
  const a = endpoint("001122334455");
  const b = endpoint("AABBCCDDEEFF");
  let executed = 0;
  const sender = protocol(a);
  const receiver = protocol(b, {
    onCommand({ data }) {
      executed++;
      assert.deepEqual([...new Uint8Array(data)], [42]);
    },
  });
  const done = sender.send(b.id, payload(42));
  const data = a.frames[0].data;
  receiver.receive(event(a, b, data));
  await flush();
  assert.equal(executed, 1);
  assert.equal(b.frames.length, 1);
  fireTimer(); // first ACK lost
  await flush();
  assert.deepEqual(a.frames[1].data, data);
  receiver.receive(event(a, b, a.frames[1].data));
  await flush();
  assert.equal(executed, 1);
  assert.equal(b.frames.length, 2);
  const ack = b.frames[1].data;
  sender.receive(event(endpoint("112233445566"), a, ack));
  assert.equal(sender.pending, 1);
  sender.receive(event(b, a, ack));
  await done;
  assert.equal(timers.size, 0);
  sender.close();
  receiver.close();
});

test("ACK waits for async handler; duplicate history is bounded without eviction", async () => {
  const a = endpoint("001122334455");
  const b = endpoint("AABBCCDDEEFF");
  let complete;
  let executed = 0;
  const sender = protocol(a);
  const receiver = protocol(b, {
    receiveSessionLimit: 1,
    onCommand() {
      executed++;
      return new Promise((resolve) => {
        complete = resolve;
      });
    },
  });
  const done = sender.send(b.id, payload(1));
  const frame = a.frames[0].data;
  receiver.receive(event(a, b, frame));
  receiver.receive(event(a, b, frame));
  await flush();
  assert.equal(b.frames.length, 0);
  assert.equal(executed, 1);
  complete();
  await flush();
  assert.equal(b.frames.length, 1);
  sender.receive(event(b, a, b.frames[0].data));
  await done;
  const newSession = frame.slice(0);
  new DataView(newSession).setUint32(8, 456);
  receiver.receive(event(a, b, newSession));
  await flush();
  assert.equal(executed, 1);
  receiver.receive(event(a, b, frame));
  await flush();
  assert.equal(b.frames.length, 2);
  sender.close();
  receiver.close();
});

test("commands have bounded retries, queue and frame size; close cancels ACK timers", async () => {
  const a = endpoint("001122334455");
  const peer = "AABBCCDDEEFF";
  const sender = protocol(a, { retries: 1, queueLimit: 1 });
  const failed = assert.rejects(sender.send(peer, payload(1)), /ACK timed out/);
  await assert.rejects(sender.send(peer, payload(2)), /full/);
  await flush();
  fireTimer();
  await flush();
  fireTimer();
  await failed;
  assert.equal(a.frames.length, 2);
  await assert.rejects(sender.send("FFFFFFFFFFFF", payload(1)), /unicast/);
  await assert.rejects(sender.send(peer, new Uint8Array(235)), /length/);
  const closed = assert.rejects(
    sender.send(peer, new Uint8Array(234)),
    /closed/,
  );
  await flush();
  assert.equal(timers.size, 1);
  sender.close();
  await closed;
  assert.equal(timers.size, 0);
});

test("failed handler does not ACK, malformed or broadcast commands never execute", async () => {
  const a = endpoint("001122334455");
  const b = endpoint("AABBCCDDEEFF");
  const sender = protocol(a);
  let calls = 0;
  const receiver = protocol(b, {
    onCommand() {
      if (++calls === 1) throw Error("failed");
    },
  });
  const done = sender.send(b.id, payload(1));
  const frame = a.frames[0].data;
  assert.equal(receiver.receive(event(a, b, new ArrayBuffer(2))), false);
  receiver.receive({ ...event(a, b, frame), broadcast: true });
  const malformed = frame.slice(0);
  new DataView(malformed).setUint16(6, 1);
  receiver.receive(event(a, b, malformed));
  assert.equal(calls, 0);
  receiver.receive(event(a, b, frame));
  await flush();
  assert.equal(b.frames.length, 0);
  receiver.receive(event(a, b, frame));
  await flush();
  assert.equal(calls, 2);
  sender.receive(event(b, a, b.frames[0].data));
  await done;
  sender.close();
  receiver.close();
});

test("invalid latest replacement leaves previous data intact; timeout options validate before opening", async () => {
  for (const sendTimeout of [
    0,
    -1,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    0.5,
    0x80000000,
  ])
    assert.throws(() => new ESPNow({ sendTimeout }), /sendTimeout/);
  const radio = new ESPNow({ queueLimit: 2 });
  const first = radio.send(undefined, payload(1));
  const second = radio.sendLatest(undefined, payload(2));
  await assert.rejects(
    radio.sendLatest(undefined, new ArrayBuffer(0)),
    /length/,
  );
  sent();
  assert.deepEqual([...new Uint8Array(latestCall("_send").args[1])], [2]);
  sent();
  await Promise.all([first, second]);
  radio.close();
});

test("ACK must match session, sequence and exact frame length; commands progress in order", async () => {
  const a = endpoint("001122334455");
  const b = endpoint("AABBCCDDEEFF");
  const executed = [];
  const sender = protocol(a);
  const receiver = protocol(b, {
    onCommand({ data }) {
      executed.push(new Uint8Array(data)[0]);
    },
  });
  const input = Uint8Array.of(9, 1, 8);
  const first = sender.send(b.id, new DataView(input.buffer, 1, 1));
  input.fill(99);
  const second = sender.send(b.id, payload(2));
  assert.equal(a.frames.length, 1);
  receiver.receive(event(a, b, a.frames[0].data));
  await flush();
  const ack = b.frames[0].data;
  for (const offset of [8, 12]) {
    const wrong = ack.slice(0);
    new DataView(wrong).setUint32(offset, 999);
    sender.receive(event(b, a, wrong));
    assert.equal(sender.pending, 2);
  }
  const long = new Uint8Array(17);
  long.set(new Uint8Array(ack));
  sender.receive(event(b, a, long.buffer));
  assert.equal(sender.pending, 2);
  sender.receive(event(b, a, ack));
  await first;
  assert.equal(a.frames.length, 2);
  receiver.receive(event(a, b, a.frames[1].data));
  await flush();
  sender.receive(event(b, a, b.frames[1].data));
  await second;
  receiver.receive(event(a, b, a.frames[0].data));
  await flush();
  assert.deepEqual(executed, [1, 2]);
  sender.close();
  receiver.close();
});

test("MAC failures retry with a bound and close ignores a late completion", async () => {
  let attempts = 0;
  let finish;
  const radio = {
    info: { maxDataLength: 250 },
    send() {
      attempts++;
      return attempts === 1
        ? Promise.reject(Error("MAC failure"))
        : new Promise((resolve) => {
            finish = resolve;
          });
    },
  };
  const sender = protocol(radio, { retries: 1 });
  const pending = assert.rejects(
    sender.send("AABBCCDDEEFF", payload(1)),
    /closed/,
  );
  await flush();
  fireTimer();
  await flush();
  assert.equal(attempts, 2);
  sender.close();
  finish();
  await flush();
  await pending;
  assert.equal(timers.size, 0);
});
