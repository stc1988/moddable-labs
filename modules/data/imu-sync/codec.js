// Transport-independent IMU/ball snapshot. All multi-byte fields are little-endian.
export const BYTE_LENGTH = 16;
const SCALE = 1024;

function finite(value) {
  if (!Number.isFinite(value)) throw new RangeError("Expected a finite number");
  return value;
}

function acceleration(value) {
  return Math.round(
    Math.max(-32, Math.min(32767 / SCALE, finite(value))) * SCALE,
  );
}

function position(value) {
  return Math.round(Math.max(0, Math.min(1, finite(value))) * 65535);
}

export function encode(
  { sequence, accelerometer, ball },
  buffer = new ArrayBuffer(BYTE_LENGTH),
) {
  if (!Number.isInteger(sequence) || sequence < 0 || sequence > 65535)
    throw new RangeError("sequence must be uint16");
  if (!(buffer instanceof ArrayBuffer) || buffer.byteLength !== BYTE_LENGTH)
    throw new RangeError("Expected a 16-byte ArrayBuffer");
  const view = new DataView(buffer);
  view.setUint16(0, 0x4d49, true); // ASCII IM
  view.setUint8(2, 1); // Version
  view.setUint8(3, 1); // IMU + ball snapshot
  view.setUint16(4, sequence, true);
  view.setInt16(6, acceleration(accelerometer.x), true);
  view.setInt16(8, acceleration(accelerometer.y), true);
  view.setInt16(10, acceleration(accelerometer.z), true);
  view.setUint16(12, position(ball.x), true);
  view.setUint16(14, position(ball.y), true);
  return buffer;
}

export function decode(buffer) {
  if (!(buffer instanceof ArrayBuffer) || buffer.byteLength !== BYTE_LENGTH)
    return undefined;
  const view = new DataView(buffer);
  if (
    view.getUint16(0, true) !== 0x4d49 ||
    view.getUint8(2) !== 1 ||
    view.getUint8(3) !== 1
  )
    return undefined;
  return {
    sequence: view.getUint16(4, true),
    accelerometer: {
      x: view.getInt16(6, true) / SCALE,
      y: view.getInt16(8, true) / SCALE,
      z: view.getInt16(10, true) / SCALE,
    },
    ball: {
      x: view.getUint16(12, true) / 65535,
      y: view.getUint16(14, true) / 65535,
    },
  };
}
