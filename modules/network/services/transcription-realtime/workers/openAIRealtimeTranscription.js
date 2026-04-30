import OpenAIRealTimeModel from "openAIRealtimeModel";
import config from "mc/config";

class OpenAIRealTimeTranscriptionModel extends OpenAIRealTimeModel {
  configure(message) {
    super.configure(message);
    this.path = "/v1/realtime?intent=transcription";
    const apiKey = message.apiKey ?? config.openAIKey;
    this.headers = [["Authorization", `Bearer ${apiKey}`]];
    this.session = {
      type: "transcription",
      audio: {
        input: {
          format: {
            type: "audio/pcma",
          },
          transcription: {
            model: "gpt-4o-mini-transcribe",
            prompt: "",
            language: "ja",
          },
          noise_reduction: {
            type: "far_field",
          },
          turn_detection: {
            type: "server_vad",
            threshold: 0.5,
            prefix_padding_ms: 200,
            silence_duration_ms: 150,
          },
        },
      },
    };
  }
  "conversation.item.input_audio_transcription.delta"(message) {
    this.postMessage({ id: "receiveInputText", text: message.delta, more: true });
  }
  "conversation.item.input_audio_transcription.completed"(message) {
    this.postMessage({ id: "receiveInputText", text: message.text, more: false });
  }
}

new OpenAIRealTimeTranscriptionModel({
  inputSampleRate: 8000,
});
