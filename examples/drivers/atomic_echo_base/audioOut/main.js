// based on examples/io/audioout/play-sync

import AudioOut from "embedded:io/audio/out";
import { MAUD, SampleFormat } from "maudHeader";
import Resource from "Resource";

const one = loadSound("one.maud");
const two = loadSound("two.maud");
let playing = one;

const output = new AudioOut({
  onWritable(size) {
    let writableSize = size;
    do {
      let use = playing.byteLength - playing.position;
      if (use > writableSize) use = writableSize;
      this.write(playing.subarray(playing.position, playing.position + use));
      playing.position += use;
      if (playing.position === playing.byteLength) {
        playing.position = 0;
        playing = playing === one ? two : one;
      }
      writableSize -= use;
    } while (writableSize);
  },
});
output.start();

function loadSound(name) {
  let snd = new MAUD(new Resource(name));
  if (
    !(1 === snd.version) &&
    "ma" === snd.tag &&
    SampleFormat.Uncompressed === snd.sampleFormat &&
    16 === snd.bitPerSample &&
    1 === snd.channels
  )
    throw new Error();
  snd = new Uint8Array(
    snd.buffer,
    snd.byteOffset + snd.byteLength,
    snd.bufferSamples * 2,
  );
  snd.position = 0;

  return snd;
}
