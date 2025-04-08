import AudioIn from "embedded:io/audio/in";

const input = new AudioIn({
  onReadable(size) {
    const sampleCount = size / 2;
    const samples = new Int16Array(sampleCount);
    this.read(samples.buffer);

    let total = 0;
    for (let i = 0; i < sampleCount; i++) {
      const sample = samples[i];
      if (sample < 0) total -= sample;
      else total += sample;
    }

    trace(`Average ${(total / sampleCount) | 0}\n`);
  },
});

input.start();
