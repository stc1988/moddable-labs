declare module "imu-sync" {
  export interface Snapshot {
    sequence: number;
    accelerometer: { x: number; y: number; z: number };
    ball: { x: number; y: number };
  }
  export const BYTE_LENGTH: 16;
  export function encode(snapshot: Snapshot, buffer?: ArrayBuffer): ArrayBuffer;
  export function decode(buffer: ArrayBuffer): Snapshot | undefined;
}
