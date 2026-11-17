// The sender owns the physics; the receiver only displays complete snapshots.
export default class BounceModel {
  x = 0.5;
  y = 0.5;
  vx = 0;
  vy = 0;

  declare width: number;
  declare height: number;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
  }

  step({ x, y }: { x: number; y: number }, milliseconds: number) {
    // Preserve the reference bounce's ~60 Hz motion at other sample intervals.
    const dt = milliseconds / 17;
    const damping = 0.98 ** dt;
    this.vx = (this.vx - x * dt) * damping;
    this.vy = (this.vy + y * dt) * damping;
    const nx = this.x * this.width + this.vx * dt;
    const ny = this.y * this.height + this.vy * dt;
    if (nx < 0 || nx > this.width) this.vx = -this.vx;
    if (ny < 0 || ny > this.height) this.vy = -this.vy;
    this.x = Math.max(0, Math.min(this.width, nx)) / this.width;
    this.y = Math.max(0, Math.min(this.height, ny)) / this.height;
    return { x: this.x, y: this.y };
  }
}
