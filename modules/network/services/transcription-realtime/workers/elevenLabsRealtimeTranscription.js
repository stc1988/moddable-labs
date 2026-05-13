import ChatWebSocketWorker from "ChatWebSocketWorker";
import ElevenLabsAgentModel from "elevenLabsAgentModel";
import config from "mc/config";
import { URLSearchParams } from "url";

// https://elevenlabs.io/docs/api-reference/speech-to-text/v-1-speech-to-text-realtime
const audioPrefixNonCommit = Object.freeze(
  new Uint8Array(
    ArrayBuffer.fromString(
      `{"message_type":"input_audio_chunk","commit":"false","sample_rate":"16000","audio_base_64":"`,
    ),
  ),
  true,
);
const audioPrefixCommit = Object.freeze(
  new Uint8Array(
    ArrayBuffer.fromString(
      `{"message_type":"input_audio_chunk","commit":"true","sample_rate":"16000","audio_base_64":"`,
    ),
  ),
  true,
);

class ElevenLabsRealTimeTranscriptionModel extends ElevenLabsAgentModel {
  configure(message) {
    super.configure(message);
    this.audioPrefix = audioPrefixNonCommit;
    const params = new URLSearchParams({
      model_id: "scribe_v2_realtime",
      audio_format: "pcm_16000",
      language_code: "ja",
      commit_strategy: "manual",
    });
    this.path = `/v1/speech-to-text/realtime?${params.toString()}`;

    const apiKey = message.apiKey ?? config.elevenLabsKey;
    this.headers = [["xi-api-key", apiKey]];
    this.client_vad = false;
  }
  connect(message) {
    ChatWebSocketWorker.prototype.connect.call(this, message);
  }
  onJSON(json) {
    const type = json.message_type;
    if (type in this) this[type](json);
  }
  session_started(message) {
    this.post("connected");
  }
  input_commit(message) {
    this.client_vad = true;
  }
  sendAudio(message) {
    if (this.client_vad) {
      this.audioPrefix = audioPrefixCommit;
      ChatWebSocketWorker.prototype.sendAudio.call(this, message);
      this.audioPrefix = audioPrefixNonCommit;
      this.client_vad = false;
    } else {
      ChatWebSocketWorker.prototype.sendAudio.call(this, message);
    }
  }
  partial_transcript(message) {
    this.postMessage({
      id: "receiveInputText",
      text: message.text,
      more: true,
    });
  }
  committed_transcript(message) {
    this.postMessage({
      id: "receiveInputText",
      text: message.text,
      more: false,
    });
  }
}

new ElevenLabsRealTimeTranscriptionModel({
  inputSampleRate: 8000,
});
