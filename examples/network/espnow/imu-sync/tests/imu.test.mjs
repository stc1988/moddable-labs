import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const url = (source) =>
  `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
const codecURL = url(
  await readFile(
    new URL("../../../../../modules/data/imu-sync/codec.js", import.meta.url),
    "utf8",
  ),
);
const { encode, decode } = await import(codecURL);
const modelURL = url(
  await readFile(new URL("../shared/model.js", import.meta.url), "utf8"),
);
const { default: Model } = await import(modelURL);

test("bounce stays inside the display after long tilts and reversals", () => {
  const model = new Model(288, 98);
  for (let i = 0; i < 2000; i++) {
    const position = model.step({ x: i < 1000 ? 1 : -1, y: 0.7 }, 33);
    assert.ok(position.x >= 0 && position.x <= 1);
    assert.ok(position.y >= 0 && position.y <= 1);
    assert.ok(Number.isFinite(model.vx) && Number.isFinite(model.vy));
  }
});

test("sender and receiver converge after loss, skip busy sends, reject foreign/old frames and recover after reboot", async () => {
  const timers = [];
  const radios = [];
  const views = [];
  let samples = 0;
  let now = 10000;
  const originalNow = Date.now;
  Date.now = () => now;
  globalThis.IMUTestTimer = { repeat: (callback) => timers.push(callback) };
  globalThis.device = {
    sensor: {
      IMU: class {
        sample() {
          samples++;
          return { accelerometer: { x: 4.903325, y: -2.4516625, z: 9.80665 } };
        }
      },
    },
  };
  globalThis.IMUTestView = class {
    width = 288;
    height = 98;
    constructor() {
      views.push(this);
    }
    show(snapshot, status) {
      this.snapshot = snapshot;
      this.status = status;
    }
  };
  globalThis.IMUTestRadio = class {
    id = `00000000000${radios.length}`;
    pending = 0;
    frames = [];
    constructor(options) {
      this.options = options;
      radios.push(this);
    }
    send(peer, data) {
      this.frames.push(data);
      return Promise.resolve();
    }
  };
  const raw = await readFile(
    new URL("../shared/main.js", import.meta.url),
    "utf8",
  );
  const start = async (role) => {
    const source = raw
      .replace(
        'import ESPNow from "espnow/queued";',
        "const ESPNow = globalThis.IMUTestRadio;",
      )
      .replace('from "imu-sync"', `from "${codecURL}"`)
      .replace(
        'import config from "mc/config";',
        `const config = { imuSync: { role: "${role}", channel: 1, interval: 33, accelerationScale: 9.80665 } };`,
      )
      .replace(
        'import Timer from "timer";',
        "const Timer = globalThis.IMUTestTimer;",
      )
      .replace('from "bounce-model"', `from "${modelURL}"`)
      .replace(
        'import BounceView from "bounce-view";',
        "const BounceView = globalThis.IMUTestView;",
      );
    await import(url(source));
  };
  globalThis.trace = () => {};
  try {
    await start("sender");
    // Receiver must work without any local IMU.
    delete globalThis.device;
    await start("receiver");
    const deliver = (data, from = radios[0].id) =>
      radios[1].options.onReceive({ peerId: from, data });
    for (let i = 0; i < 100; i++) {
      now += 33;
      timers[0]();
      if (i % 3 === 0) deliver(radios[0].frames.at(-1));
      timers[1]();
    }
    assert.equal(samples, 100);
    assert.deepEqual(views[1].snapshot, views[0].snapshot);
    assert.deepEqual(views[1].snapshot.accelerometer, {
      x: 0.5,
      y: -0.25,
      z: 1,
    });
    const current = views[1].snapshot;
    deliver(radios[0].frames[0]);
    deliver(radios[0].frames.at(-1));
    deliver(
      encode({ ...current, sequence: 100, ball: { x: 0, y: 0 } }),
      "foreign",
    );
    deliver(new ArrayBuffer(3));
    timers[1]();
    assert.deepEqual(views[1].snapshot, current);
    radios[0].pending = 1;
    timers[0]();
    assert.equal(radios[0].frames.length, 100);
    radios[0].pending = 0;
    timers[0]();
    deliver(radios[0].frames.at(-1));
    timers[1]();
    assert.deepEqual(views[1].snapshot, views[0].snapshot);
    now += 2100;
    timers[1]();
    assert.equal(views[1].status, "waiting");
    deliver(radios[0].frames[0]); // Restarted sender with sequence 0
    timers[1]();
    assert.equal(views[1].snapshot.sequence, 0);
    assert.equal(views[1].status, "RX");
    now += 2100;
    deliver(encode({ ...current, sequence: 65535 }));
    deliver(encode({ ...current, sequence: 0 }));
    timers[1]();
    assert.equal(views[1].snapshot.sequence, 0); // uint16 wraparound
    assert.equal(decode(radios[0].frames[0]).sequence, 0);
  } finally {
    Date.now = originalNow;
    for (const key of [
      "IMUTestTimer",
      "IMUTestView",
      "IMUTestRadio",
      "trace",
      "device",
    ])
      delete globalThis[key];
  }
});
