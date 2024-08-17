import TM1637 from "tm1637";
import Timer from "timer";

const tm1637 = new TM1637({ pin: { clk: 22, dio: 21 }, brightness: 7 });

// write
tm1637.write([0x7f, 0xff, 0x7f, 0x7f]); // 88:88
Timer.delay(500);

tm1637.write([0, 0, 0, 0]); // ____
Timer.delay(500);

tm1637.write([0x3f], 0); // 0___
Timer.delay(500);
tm1637.clear();

tm1637.write([0x06], 1); // _1__
Timer.delay(500);
tm1637.clear();

tm1637.write([0x5b], 2); // __2_
Timer.delay(500);
tm1637.clear();

tm1637.write([0x4f], 3); // ___3
Timer.delay(500);
tm1637.clear();

tm1637.write([0x06, 0x5b], 1); // _12_
Timer.delay(500);
tm1637.clear();

// number
tm1637.number(1234); // 1234
Timer.delay(500);

tm1637.number(4); // ___4
Timer.delay(500);

tm1637.number(-123); // -123
Timer.delay(500);

tm1637.number(-3); // __-3
Timer.delay(500);

tm1637.number(1234, { colon: true }); // 12:34
Timer.delay(500);

tm1637.number(4, { leading_zeros: true }); // 0004
Timer.delay(500);

tm1637.number(-4, { leading_zeros: true }); // 00-4
Timer.delay(500);

// hex
tm1637.hex(0xabcd); // AbCd
Timer.delay(500);

tm1637.hex(0xcdef); // CdEF
Timer.delay(500);

tm1637.hex(0xcd); // __Cd
Timer.delay(500);

tm1637.hex(0xef, { leading_zeros: true }); // 00EF
Timer.delay(500);

tm1637.hex(0xffff, { colon: true }); // FF:FF
Timer.delay(500);

// count time sample
let count = 0;
Timer.repeat(() => {
  const disp = Math.floor(count / 60) * 100 + (count % 60);
  tm1637.number(disp, { colon: true, leading_zeros: true });
  count++;
}, 1000);
