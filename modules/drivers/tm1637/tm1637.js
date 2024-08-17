const TM1637_I2C_COMM1 = 0x40;
const TM1637_I2C_COMM2 = 0xc0;
const TM1637_I2C_COMM3 = 0x80;
const DIGITS = 4;

class TM1637 {
  #clkpin;
  #diopin;
  #brightness = 2; // 0 - 7

  constructor(options) {
    const Digital = device.io.Digital;

    this.#clkpin = new Digital({ pin: options.pin.clk, mode: Digital.Output });
    this.#diopin = new Digital({ pin: options.pin.dio, mode: Digital.Output });
  }
  configure(options) {
    if ("brightness" in options) {
      const brightness = options.brightness;
      if (typeof brightness != "number" || brightness < 0 || 7 < brightness)
        throw new RangeError();
      this.#brightness = brightness;
    }
  }
  #charToSegments(char) {
    switch (char) {
      //     A
      //     ---
      //  F |   | B   *
      //     -G-      H (on 2nd segment)
      //  E |   | C   *
      //     ---
      //      D
      //                 HGFEDCBA
      case "0":
        return 0b00111111;
      case "1":
        return 0b00000110;
      case "2":
        return 0b01011011;
      case "3":
        return 0b01001111;
      case "4":
        return 0b01100110;
      case "5":
        return 0b01101101;
      case "6":
        return 0b01111101;
      case "7":
        return 0b00000111;
      case "8":
        return 0b01111111;
      case "9":
        return 0b01101111;
      case "a":
      case "A":
        return 0b01110111;
      case "B":
      case "b":
        return 0b01111100;
      case "c":
      case "C":
        return 0b00111001;
      case "D":
      case "d":
        return 0b01011110;
      case "e":
      case "E":
        return 0b01111001;
      case "f":
      case "F":
        return 0b01110001;
      case "-":
        return 0b01000000;
      default:
        return 0b00000000;
    }
  }
  #stringToSegments(string, dictionary) {
    const options = {
      colon: false,
      leading_zeros: false,
      ...dictionary,
    };
    const segments = new Array(DIGITS);
    if (options.leading_zeros) {
      string += string.padStart(DIGITS, "0");
    }
    for (let i = 0; i < DIGITS; i++) {
      segments[DIGITS - i - 1] = this.#charToSegments(
        string[string.length - i - 1],
      );
      if (i == 2 && options.colon) segments[DIGITS - i - 1] += 0x80;
    }

    return segments;
  }
  write(segments, pos = 0) {
    this.#start();
    this.#writeByte(TM1637_I2C_COMM1);
    this.#stop();

    this.#start();
    this.#writeByte(TM1637_I2C_COMM2 | pos);
    for (let i = 0; i < DIGITS; i++) {
      this.#writeByte(segments[i]);
    }
    this.#stop();

    this.#start();
    this.#writeByte(TM1637_I2C_COMM3 | 0x08 | this.brightness);
    this.#stop();
  }
  number(number, dictionary) {
    const segments = this.#stringToSegments(number.toString(10), dictionary);
    this.write(segments);
  }
  hex(hex, dictionary) {
    const segments = this.#stringToSegments(hex.toString(16), dictionary);
    this.write(segments);
  }
  clear() {
    this.write([0x00, 0x00, 0x00, 0x00]);
  }
  #start() {
    this.#clkpin.write(1);
    this.#diopin.write(1);
    this.#diopin.write(0);
    this.#clkpin.write(0);
  }
  #stop() {
    this.#clkpin.write(0);
    this.#diopin.write(0);
    this.#clkpin.write(1);
    this.#diopin.write(1);
  }
  #writeByte(byte) {
    const data = byte;

    for (let i = 0; i < 8; i++) {
      this.#clkpin.write(0);
      this.#diopin.write((data >> i) & 0x01);
      this.#clkpin.write(1);
    }

    this.#clkpin.write(0);
    this.#diopin.write(1);
    this.#clkpin.write(1);
  }
}

export default TM1637;
