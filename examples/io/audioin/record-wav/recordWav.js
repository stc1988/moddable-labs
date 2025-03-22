import AudioIn from "embedded:io/audio/in";

async function recordWav(durationMilliSec = 3000) {
  const HEADER_SIZE = 44;
  return new Promise((resolve) => {
    let writeOffset = 0;
    const audioin = new AudioIn({
      onReadable(size) {
        const remaining = wavBuffer.byteLength - writeOffset;
        const chunkSize = Math.min(size, remaining);
        const chunk = this.read(chunkSize);

        if (!chunk) {
          this.close();
          resolve(wavBuffer);
        } else {
          dataView.set(new Uint8Array(chunk), writeOffset);
          writeOffset += chunkSize;
          if (writeOffset >= wavBuffer.byteLength - HEADER_SIZE) {
            this.close();
            resolve(wavBuffer);
          }
        }
      },
    });

    // generate header
    const { sampleRate, channels, bitsPerSample } = audioin;
    const byteRate = sampleRate * channels * (bitsPerSample >> 3);
    const contentLength = (durationMilliSec / 1000) * byteRate;
    const wavBuffer = new ArrayBuffer(HEADER_SIZE + contentLength);
    const headerView = new DataView(wavBuffer);
    const dataView = new Uint8Array(wavBuffer, HEADER_SIZE);

    headerView.setUint8(0, "R".charCodeAt());
    headerView.setUint8(1, "I".charCodeAt());
    headerView.setUint8(2, "F".charCodeAt());
    headerView.setUint8(3, "F".charCodeAt());
    headerView.setUint32(4, 36 + contentLength, true);
    headerView.setUint8(8, "W".charCodeAt());
    headerView.setUint8(9, "A".charCodeAt());
    headerView.setUint8(10, "V".charCodeAt());
    headerView.setUint8(11, "E".charCodeAt());
    headerView.setUint8(12, "f".charCodeAt());
    headerView.setUint8(13, "m".charCodeAt());
    headerView.setUint8(14, "t".charCodeAt());
    headerView.setUint8(15, " ".charCodeAt());
    headerView.setUint32(16, 16, true);
    headerView.setUint16(20, channels, true);
    headerView.setUint16(22, channels, true);
    headerView.setUint32(24, sampleRate, true);
    headerView.setUint32(28, byteRate, true);
    headerView.setUint16(32, (channels * bitsPerSample) >> 3, true);
    headerView.setUint16(34, bitsPerSample, true);
    headerView.setUint8(36, "d".charCodeAt());
    headerView.setUint8(37, "a".charCodeAt());
    headerView.setUint8(38, "t".charCodeAt());
    headerView.setUint8(39, "a".charCodeAt());
    headerView.setUint32(40, contentLength, true);

    // start recording
    audioin.start();
  });
}

export default recordWav;
