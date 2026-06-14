import config from "mc/config";
import GoogleGeminiLiveModel from "googleGeminiLiveModel";

const audioPrefix = Object.freeze(
  new Uint8Array(
    ArrayBuffer.fromString(
      '{"realtimeInput":{"audio":{"mimeType":"audio/pcm;rate=16000","data":"',
    ),
  ),
  true,
);
const audioSuffix = Object.freeze(
  new Uint8Array(ArrayBuffer.fromString('"}}}')),
  true,
);

// https://ai.google.dev/gemini-api/docs/live-api/live-translate?hl=ja#websockets
class GoogleGeminiLiveTranscription extends GoogleGeminiLiveModel {
  configure(message) {
    const model = message.modelID ?? "gemini-3.5-live-translate-preview";
    const apiKey = message.apiKey ?? config.geminiAPIKey;

    this.audioPrefix = audioPrefix;
    this.audioSuffix = audioSuffix;

    this.path = `/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${apiKey}`;
    this.setup = {
      model: `models/${model}`,
      generationConfig: {
        translationConfig: {
          targetLanguageCode: "en",
          echoTargetLanguage: false,
        },
      },
    };
  }
  serverContent(data) {
    // trace(`${JSON.stringify(data)}\n`)
    const inputTranscription = data?.inputTranscription;
    if (inputTranscription?.text) {
      trace(
        `[inputTranscription](${data.inputTranscription.languageCode}) ${data.inputTranscription.text}\n`,
      );
      this.postMessage({
        id: "receiveInputText",
        text: data.inputTranscription.text,
        more: true,
      });
    }
    const outputTranscription = data.outputTranscription;
    if (outputTranscription?.text) {
      trace(
        `[outputTranscription](${data.outputTranscription.languageCode}) ${data.outputTranscription.text}\n`,
      );
      this.postMessage({
        id: "receiveOutputText",
        text: data.outputTranscription.text,
        more: true,
      });
    }
  }
}

new GoogleGeminiLiveTranscription({
  inputSampleRate: 16000,
});
