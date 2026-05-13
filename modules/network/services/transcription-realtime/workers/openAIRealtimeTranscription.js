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
            model: "gpt-realtime-whisper",
            language: "ja",
          },
          noise_reduction: {
            type: "far_field",
          },
        },
      },
    };
  }
  input_commit(message) {
    this.sendJSON({ type: "input_audio_buffer.commit" });
  }
  "conversation.item.input_audio_transcription.delta"(message) {
    this.postMessage({
      id: "receiveInputText",
      text: message.delta,
      more: true,
    });
  }
  "conversation.item.input_audio_transcription.completed"(message) {
    this.postMessage({
      id: "receiveInputText",
      text: message.transcript,
      more: false,
    });
  }
}

new OpenAIRealTimeTranscriptionModel({
  inputSampleRate: 8000,
});
