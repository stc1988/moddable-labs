/*
https://github.com/m5stack/M5Unit-Sonic
*/

import Timer from "timer";

const MAX_RANGE = 4500.0;
const MIN_RANGE = 20.0;

class RCWL9620 {
  #io;
  #valueBuffer = new Uint8Array(3);
  #byteBuffer = new Uint8Array(1);
  #onError;

  constructor(options) {
    // biome-ignore lint: Moddable way
    const io = (this.#io = new options.sensor.io({
      address: 0x57,
      hz: 100000,
      ...options.sensor,
    }));

    this.#onError = options.onError;

    this.configure({});
  }

  configure(options) {}

  #getDistance() {
    const io = this.#io;
    const vBuf = this.#valueBuffer;
    const bBuf = this.#byteBuffer;

    bBuf[0] = 0x01;
    io.write(bBuf);
    Timer.delay(200);

    io.read(vBuf);
    const distance = ((vBuf[0] << 16) | (vBuf[1] << 8) | vBuf[2]) / 1000;

    if (distance > MAX_RANGE) {
      return MAX_RANGE;
    }
    if (distance < MIN_RANGE) {
      return MIN_RANGE;
    }
    return distance;
  }

  close() {
    this.#io?.close();
    this.#io = undefined;
  }

  sample() {
    return this.#getDistance();
  }
}

export default RCWL9620;
