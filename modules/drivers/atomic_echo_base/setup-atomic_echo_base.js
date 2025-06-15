import config from "mc/config";
import Timer from "timer";

const SMBus = device.io.SMBus;

export default function (done) {
  new ES8311();
  new PI4IOE5V6408();

  done?.();
}

class ES8311 {
  // initialize ES8311(0x18)
  // https://github.com/m5stack/uiflow-micropython/blob/master/m5stack/libs/driver/es8311/__init__.py
  constructor(options) {
    const es = new SMBus({
      io: SMBus,
      data: config.i2c_bus.sda,
      clock: config.i2c_bus.scl,
      address: 0x18,
      hz: 100000,
    });
    es.writeUint8(0x00, 0x1f); // ES8311_RESET_REG00
    Timer.delay(20);
    es.writeUint8(0x00, 0x00); // ES8311_RESET_REG00
    es.writeUint8(0x00, 0x80); // ES8311_RESET_REG00

    // clock config
    es.writeUint8(0x01, 0xbf); // ES8311_CLK_MANAGER_REG01
    es.readUint8(0x06); // ES8311_CLK_MANAGER_REG06
    es.writeUint8(0x06, 0x03); // ES8311_CLK_MANAGER_REG06
    es.readUint8(0x02); // ES8311_CLK_MANAGER_REG02
    es.writeUint8(0x02, 0x10); // ES8311_CLK_MANAGER_REG02
    es.writeUint8(0x03, 0x10); // ES8311_CLK_MANAGER_REG03
    es.writeUint8(0x04, 0x10); // ES8311_CLK_MANAGER_REG04
    es.writeUint8(0x05, 0x00); // ES8311_CLK_MANAGER_REG05
    es.readUint8(0x06); // ES8311_CLK_MANAGER_REG06
    es.writeUint8(0x06, 0x03); // ES8311_CLK_MANAGER_REG06
    es.readUint8(0x07); // ES8311_CLK_MANAGER_REG06
    es.writeUint8(0x07, 0x00); // ES8311_CLK_MANAGER_REG07
    es.writeUint8(0x08, 0xff); // ES8311_CLK_MANAGER_REG08

    // format config
    es.readUint8(0x00); // ES8311_RESET_REG00
    es.writeUint8(0x00, 0x80); // ES8311_RESET_REG00
    es.writeUint8(0x09, 0x10); // ES8311_SDPIN_REG09
    es.writeUint8(0x0a, 0x10); // ES8311_SDPOUT_REG0A

    //
    es.writeUint8(0x0d, 0x01); // ES8311_SYSTEM_REG0D
    es.writeUint8(0x0e, 0x02); // ES8311_SYSTEM_REG0E
    es.writeUint8(0x12, 0x00); // ES8311_SYSTEM_REG12
    es.writeUint8(0x13, 0x10); // ES8311_SYSTEM_REG13
    es.writeUint8(0x1c, 0x6a); // ES8311_ADC_REG1C
    es.writeUint8(0x37, 0x08); // ES8311_DAC_REG37

    // set volume (0 - 256)
    let volume = config.es8311.volume ?? 128;
    if (volume < 0) volume = 0;
    if (volume > 255) volume = 255;
    es.writeUint8(0x32, volume); // ES8311_DAC_REG32

    // microphone
    es.writeUint8(0x17, 0xff); // ES8311_ADC_REG17 (ADC volume)
    es.writeUint8(0x14, 0x1a); // ES8311_SYSTEM_REG14
    es.writeUint8(0x16, 0x01); // ES8311_ADC_REG16 (6DB)

    es.close();
  }
}

class PI4IOE5V6408 {
  // initialize PI4IOE5V6408(0x43)
  // https://github.com/m5stack/uiflow-micropython/blob/master/m5stack/libs/base/echo.py
  constructor(options) {
    const pi = new SMBus({
      io: SMBus,
      data: config.i2c_bus.sda,
      clock: config.i2c_bus.scl,
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
