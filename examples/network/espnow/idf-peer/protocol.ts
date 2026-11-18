/*
 * ESP-IDF examples/wifi/espnow wire-format port (Public Domain / CC0).
 * Original example: Espressif Systems. See README.md for source and scope.
 */
export const BROADCAST = "FFFFFFFFFFFF";
export const HEADER_LENGTH = 10;
export interface Frame {
  type: 0 | 1;
  state: 0 | 1;
  sequence: number;
  magic: number;
}

// esp_crc16_le(UINT16_MAX, bytes, length): reflected 0x1021,
// complemented input/output. Bytes 4..5 are zero during calculation.
function checksum(bytes: Uint8Array): number {
  let crc = 0;
  for (let index = 0; index < bytes.length; index++) {
    crc ^= index === 4 || index === 5 ? 0 : bytes[index];
    for (let bit = 0; bit < 8; bit++)
      crc = (crc >>> 1) ^ (crc & 1 ? 0x8408 : 0);
  }
  return ~crc & 0xffff;
}

export function encode(frame: Frame, length: number): ArrayBuffer {
  if (!Number.isInteger(length) || length < HEADER_LENGTH || length > 1470)
    throw new RangeError("frame length must be 10..1470");
  const data = new ArrayBuffer(length);
  const view = new DataView(data);
  view.setUint8(0, frame.type);
  view.setUint8(1, frame.state);
  view.setUint16(2, frame.sequence, true);
  view.setUint32(6, frame.magic, true);
  // The IDF example ignores payload contents. Zero padding is deterministic.
  view.setUint16(4, checksum(new Uint8Array(data)), true);
  return data;
}

export function decode(data: ArrayBuffer): Frame | undefined {
  if (data.byteLength < HEADER_LENGTH || data.byteLength > 1470) return;
  const view = new DataView(data);
  const type = view.getUint8(0);
  const state = view.getUint8(1);
  if ((type !== 0 && type !== 1) || (state !== 0 && state !== 1)) return;
  if (view.getUint16(4, true) !== checksum(new Uint8Array(data))) return;
  return {
    type,
    state,
    sequence: view.getUint16(2, true),
    magic: view.getUint32(6, true),
  };
}
