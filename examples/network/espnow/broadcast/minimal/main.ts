import ESPNow from "espnow";
import Timer from "timer";

const radio = new ESPNow({
  offlineChannel: 1,
  onReceive({ peerId, data }) {
    trace(`Received ${data.byteLength} bytes from ${peerId}\n`);
  },
});
trace(`ESP-NOW address: ${radio.id}\n`);
Timer.repeat(() => {
  radio
    .send(undefined, ArrayBuffer.fromString("hello"))
    .catch((error) => trace(`${error}\n`));
}, 1000);
