import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const source = await readFile(new URL("../codec.js", import.meta.url), "utf8");
const { BYTE_LENGTH, encode, decode } = await import(
  `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`
);
const state = {
  sequence: 65535,
  accelerometer: { x: -1.234, y: 0, z: 1 },
  ball: { x: 0.23456, y: 1 },
};

test("16-byte wire format has known little-endian fields and bounded quantization", () => {
  const packet = encode(state);
  assert.equal(packet.byteLength, BYTE_LENGTH);
  assert.deepEqual(
    [...new Uint8Array(packet).slice(0, 6)],
    [0x49, 0x4d, 1, 1, 255, 255],
  );
  const decoded = decode(packet);
  assert.equal(decoded.sequence, 65535);
  assert.ok(
    Math.abs(decoded.accelerometer.x - state.accelerometer.x) <= 0.5 / 1024,
  );
  assert.equal(decoded.accelerometer.z, 1);
  assert.ok(Math.abs(decoded.ball.x - state.ball.x) <= 0.5 / 65535);
  assert.equal(decoded.ball.y, 1);
  assert.equal(encode(state, packet), packet);
});

test("values saturate instead of overflowing signed/unsigned fields", () => {
  const result = decode(
    encode({
      sequence: 0,
      accelerometer: { x: -100, y: 100, z: 0 },
      ball: { x: -1, y: 2 },
    }),
  );
  assert.deepEqual(result.accelerometer, { x: -32, y: 32767 / 1024, z: 0 });
  assert.deepEqual(result.ball, { x: 0, y: 1 });
});

test("unrelated, truncated, and future-version packets are ignored", () => {
  for (const input of [
    null,
    {},
    new Uint8Array(16),
    new ArrayBuffer(15),
    new ArrayBuffer(17),
    new ArrayBuffer(16),
  ])
    assert.equal(decode(input), undefined);
  for (const index of [0, 1, 2, 3]) {
    const packet = encode(state);
    new Uint8Array(packet)[index] ^= 0xff;
    assert.equal(decode(packet), undefined);
  }
});

test("invalid local state is rejected before being silently coerced", () => {
  for (const sequence of [-1, 65536, 1.5, Number.NaN])
    assert.throws(() => encode({ ...state, sequence }), RangeError);
  for (const x of [Number.NaN, Number.POSITIVE_INFINITY, undefined]) {
    assert.throws(
      () => encode({ ...state, accelerometer: { ...state.accelerometer, x } }),
      RangeError,
    );
    assert.throws(() => encode({ ...state, ball: { x, y: 0 } }), RangeError);
  }
  assert.throws(() => encode(state, new ArrayBuffer(17)), RangeError);
});
