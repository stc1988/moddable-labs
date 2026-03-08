import config from "mc/config";

const SMBus = device.io.SMBus;

export default class PI4IOE5V6408 {
  // initialize PI4IOE5V6408(0x43)
  // https://github.com/m5stack/uiflow-micropython/blob/master/m5stack/libs/base/echo.py
  constructor(options) {
    const pi = new SMBus({
      io: SMBus,
      data: config.AtomicEchoBase.sda,
      clock: config.AtomicEchoBase.scl,
      address: 0x43,
      hz: 100000,
    });
    pi.readUint8(0x00); // PI4IOE_REG_CTRL
    pi.writeUint8(0x07, 0x00); // PI4IOE_REG_IO_PP
    pi.readUint8(0x07);
    pi.writeUint8(0x0d, 0xff); // PI4IOE_REG_IO_PULLUP
    pi.writeUint8(0x03, 0x6e); // PI4IOE_REG_IO_DIR
    pi.readUint8(0x03);
    pi.writeUint8(0x05, 0xff); // PI4IOE_REG_IO_OUT
    pi.readUint8(0x05);

    pi.close();
  }
}
