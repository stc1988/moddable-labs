import config from "mc/config";
import ES8311 from "es8311";
import PI4IOE5V6408 from "pi4ioe5v6408";

export default function (done) {
  // initialize expander and amp
  const expander = new PI4IOE5V6408({
    i2c: {
      io: device.io.I2C,
      data: config.AtomicEchoBase.sda,
      clock: config.AtomicEchoBase.scl,
    },
  });
  const amp = new expander.Digital({
    pin: 0,
    mode: expander.Digital.Output,
  });
  amp.write(0); // mute

  // initialize ES8311 Audio Codec
  const es = new ES8311({
    i2c: {
      io: device.io.SMBus,
      data: config.AtomicEchoBase.sda,
      clock: config.AtomicEchoBase.scl,
    },
    volume: config.AtomicEchoBase.volume,
  });
  es.close();
  amp.write(1); // unmute

  done?.();
}
