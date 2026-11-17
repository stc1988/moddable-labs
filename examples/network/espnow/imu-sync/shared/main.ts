import BounceModel from "bounce-model";
import BounceView from "bounce-view";
import ESPNow from "espnow";
import type { Snapshot } from "imu-sync";
import { decode, encode } from "imu-sync";
import config from "mc/config";
import Timer from "timer";

const options = config.imuSync as {
  role: "sender" | "receiver";
  channel: number;
  interval: number;
  accelerationScale: number;
  peerId?: string;
};
const sender = options.role === "sender";
const view = new BounceView(options.role);
const model = new BounceModel(view.width, view.height);
// Moddable's provider currently names this `sensor` (singular).
type IMUConstructor = new () => {
  sample(): { accelerometer?: { x: number; y: number; z: number } } | undefined;
};
const device = (
  globalThis as typeof globalThis & {
    device?: {
      sensors?: { IMU?: IMUConstructor };
      sensor?: { IMU?: IMUConstructor };
    };
  }
).device;
const IMU = device?.sensors?.IMU ?? device?.sensor?.IMU;
if (sender && !IMU) throw new Error("Sender requires device.sensor.IMU");
const sensor = sender && IMU ? new IMU() : undefined;
const peerId = options.peerId?.replaceAll(":", "").toUpperCase();
let source: string | undefined;
let lastReceive = 0;
let received: boolean | undefined;
let sequence = 0;
let failures = 0;
let snapshot: Snapshot = {
  sequence: 0,
  accelerometer: { x: 0, y: 0, z: 0 },
  ball: { x: 0.5, y: 0.5 },
};
const radio = new ESPNow({
  channel: options.channel,
  queueLimit: 1,
  onReceive({ peerId: from, data }) {
    if (sender || (peerId && from !== peerId)) return;
    const next = decode(data);
    if (!next) return;
    const now = Date.now();
    // Bind to the first valid sender. Permit a new sender after signal loss.
    if (source && source !== from && now - lastReceive < 2000) return;
    // Reject duplicates/old frames, but accept sender reboots after a timeout.
    if (source === from && now - lastReceive < 2000) {
      const distance = (next.sequence - snapshot.sequence) & 65535;
      if (!distance || distance >= 32768) return;
    }
    source = from;
    lastReceive = now;
    snapshot = next;
    received = true;
  },
});
if (sender && peerId) radio.addPeer(peerId);
view.mac = radio.id;
trace(`IMU ${options.role}: ${radio.id}, channel ${options.channel}\n`);
view.show(snapshot, sender ? "starting" : "waiting");

Timer.repeat(() => {
  if (sender) {
    const sample = sensor?.sample()?.accelerometer;
    if (!sample) return;
    const scale = options.accelerationScale;
    const accelerometer = {
      x: sample.x / scale,
      y: sample.y / scale,
      z: sample.z / scale,
    };
    const ball = model.step(accelerometer, options.interval);
    const buffer = encode({ sequence, accelerometer, ball });
    // Display the exact same quantized state as the receiver.
    const quantized = decode(buffer);
    if (!quantized) throw new Error("Invalid encoded IMU snapshot");
    snapshot = quantized;
    sequence = (sequence + 1) & 65535;
    // Never queue stale motion or retransmit old snapshots.
    if (!radio.pending) {
      radio.send(peerId, buffer).catch((error) => {
        failures++;
        trace(`IMU send: ${error}\n`);
      });
    }
    view.show(snapshot, failures ? `TX err ${failures}` : "TX");
  } else {
    const stale = !lastReceive || Date.now() - lastReceive > 1000;
    if (received || stale !== view.stale) {
      view.show(snapshot, stale ? "waiting" : "RX");
      view.stale = stale;
      received = false;
    }
  }
}, options.interval);
