/*
  PI4IOE5V6408
  8-bit I2C GPIO expander
  ECMA-419 IO Provider implementation
*/

const REG_CTRL = 0x00;
const REG_IO_DIR = 0x03;
const REG_IO_OUT = 0x05;
const REG_IO_PP = 0x07;
const REG_IO_PULLUP = 0x0d;
const REG_INPUT = 0x00;

class PI4IOE5V6408I2C {
  #io;

  constructor(options) {
    this.#io = new options.io(options);
  }

  write(...bytes) {
    this.#io.write(Uint8Array.from(bytes));
  }

  read(count) {
    return new Uint8Array(this.#io.read(count));
  }

  close() {
    this.#io.close?.();
  }
}

class PI4IOE5V6408 {
  #i2c;
  #direction = 0xff; // 1=input
  #output = 0x00;
  #pullup = 0x00;

  constructor(options) {
    const o = options.i2c;

    this.#i2c = new PI4IOE5V6408I2C({
      io: o.io,
      data: o.data,
      clock: o.clock,
      hz: 400_000,
      address: 0x43,
    });
    const i2c = this.#i2c;

    // read CTRL (device check)
    i2c.write(REG_CTRL);
    i2c.read(1);

    // safe defaults
    i2c.write(REG_IO_PP, 0x00); // high-impedance
    i2c.write(REG_IO_PULLUP, this.#pullup);
    i2c.write(REG_IO_DIR, this.#direction);
    i2c.write(REG_IO_OUT, this.#output);

    const provider = this;

    this.Digital = class extends Digital {
      constructor(options) {
        super(options, provider);
      }
    };
  }

  close() {
    this.#i2c.close();
    delete this.Digital;
    this.#i2c = undefined;
  }

  // internal helpers

  _readInput() {
    const i2c = this.#i2c;
    i2c.write(REG_INPUT);
    return i2c.read(1)[0];
  }

  _writeOutput(mask, value) {
    let out = this.#output;

    if (value) out |= mask;
    else out &= ~mask;

    this.#output = out;
    this.#i2c.write(REG_IO_OUT, out);
  }

  _setDirection(mask, input) {
    let dir = this.#direction;

    if (input) dir |= mask;
    else dir &= ~mask;

    this.#direction = dir;
    this.#i2c.write(REG_IO_DIR, dir);
  }

  _setPullup(mask, enable) {
    let pu = this.#pullup;

    if (enable) pu |= mask;
    else pu &= ~mask;

    this.#pullup = pu;
    this.#i2c.write(REG_IO_PULLUP, pu);
  }
}

class Digital {
  constructor(options, provider) {
    if (options.pin < 0 || options.pin > 7) throw new RangeError("invalid pin");

    const pins = 1 << options.pin;

    switch (options.mode) {
      case Digital.Input:
      case Digital.InputPullUp:
        // biome-ignore lint/correctness/noConstructorReturn: Moddable's way
        return new Input({
          ...options,
          pins,
          provider,
        });

      case Digital.Output:
        // biome-ignore lint/correctness/noConstructorReturn: Moddable's way
        return new Output({
          ...options,
          pins,
          provider,
        });

      default:
        throw new RangeError("invalid mode");
    }
  }
}

class IO {
  close() {}

  get format() {
    return "number";
  }

  set format(value) {
    if ("number" !== value) throw new Error();
  }
}

class Input extends IO {
  #provider;
  #pins;

  constructor(options) {
    super(options);

    this.#provider = options.provider;
    this.#pins = options.pins;

    const p = this.#provider;

    p._setDirection(this.#pins, true);

    if (options.mode === Digital.InputPullUp) p._setPullup(this.#pins, true);
  }

  read() {
    const v = this.#provider._readInput();
    return v & this.#pins ? 1 : 0;
  }
}

class Output extends IO {
  #provider;
  #pins;

  constructor(options) {
    super(options);

    this.#provider = options.provider;
    this.#pins = options.pins;

    this.#provider._setDirection(this.#pins, false);
  }

  write(value) {
    this.#provider._writeOutput(this.#pins, value);
  }
}

Digital.Input = 0;
Digital.InputPullUp = 1;
Digital.Output = 8;

export default PI4IOE5V6408;
