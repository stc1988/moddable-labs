import AudioIn from "audioin";
import Timer from "timer";
import config from "mc/config";
import completions from "completions";
import AudioOut from "pins/audioout";
import ElevenLabsStreamer from "elevenlabsstreamer";

const googleApiKey = config.google_api_key;
const model = "gemini-1.5-flash-latest";
const elevenLabsApiKey = config.elevenlabs_api_key;

function speechText(text) {
  const audio = new AudioOut({});
  audio.start();
  new ElevenLabsStreamer({
    key: elevenLabsApiKey,
    voice: "AZnzlk1XvdvUeBnXmlld",
    latency: 2,
    text: text,
    audio: {
      out: audio,
      stream: 0,
    },
    onError(e) {
      trace("ElevenLabs ERROR: ", e, "\n");
    },
    onDone() {
      trace("ElevenLabs Done\n");
      this.close();
    },
  });
}

async function recordSamples(audioin, durationSec, view) {
  const readingsPerSecond = 8;
  const sampleCount = Math.floor(audioin.sampleRate / readingsPerSecond);
  let samplesRemaining = durationSec * audioin.sampleRate;

  return new Promise((resolve) => {
    let offset = 44;
    Timer.repeat((id) => {
      const samples = new Int16Array(audioin.read(sampleCount));
      for (let i = 0; i < samples.length; i++) {
        view.setInt16(offset, samples[i], true);
        offset += 2;
      }

      samplesRemaining -= sampleCount;
      trace(`${samplesRemaining}\n`);
      if (samplesRemaining <= 0) {
        Timer.clear(id);
        resolve();
      }
    }, 1000 / readingsPerSecond);
  });
}

async function recordWav(durationSec = 3) {
  const audioin = new AudioIn();
  const { sampleRate, numChannels, bitsPerSample } = audioin;
  const byteRate = sampleRate * numChannels * (bitsPerSample >> 3);
  const contentLength = durationSec * byteRate;
  const view = new DataView(new ArrayBuffer(44 + contentLength));

  // header
  view.setUint8(0, "R".charCodeAt());
  view.setUint8(1, "I".charCodeAt());
  view.setUint8(2, "F".charCodeAt());
  view.setUint8(3, "F".charCodeAt());
  view.setUint32(4, 36 + contentLength, true);
  view.setUint8(8, "W".charCodeAt());
  view.setUint8(9, "A".charCodeAt());
  view.setUint8(10, "V".charCodeAt());
  view.setUint8(11, "E".charCodeAt());
  view.setUint8(12, "f".charCodeAt());
  view.setUint8(13, "m".charCodeAt());
  view.setUint8(14, "t".charCodeAt());
  view.setUint8(15, " ".charCodeAt());
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, (1 * bitsPerSample) >> 3, true);
  view.setUint16(34, bitsPerSample, true);
  view.setUint8(36, "d".charCodeAt());
  view.setUint8(37, "a".charCodeAt());
  view.setUint8(38, "t".charCodeAt());
  view.setUint8(39, "a".charCodeAt());
  view.setUint32(40, contentLength, true);

  await recordSamples(audioin, durationSec, view);

  return new Uint8Array(view.buffer);
}

async function main() {
  let audio = await recordWav();
  let body =
    // biome-ignore lint: reason
    '{"contents":[{"parts":[{"inlineData":{"mimeType":"audio/wav","data":"' +
    audio.toBase64() +
    '"}}]}],"systemInstruction":{"parts":[{"text":"Must answer within 3 sentenses."}]}}';
  audio = undefined;
  const chatCompletion = await completions({
    apiKey: googleApiKey,
    model,
    body,
  });
  body = undefined;

  trace(`${chatCompletion}\n`);
  speechText(chatCompletion);
}

main();
