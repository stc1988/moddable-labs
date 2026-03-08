import config from "mc/config";
import ES8311 from "es8311";
import PI4IOE5V6408 from "pi4ioe5v6408";

export default function (done) {
  new PI4IOE5V6408();

  const es = new ES8311({
    io: device.io.SMBus,
    data: config.AtomicEchoBase.sda,
    clock: config.AtomicEchoBase.scl,
    volume: config.AtomicEchoBase.volume,
  });
  es.close();

  done?.();
}
