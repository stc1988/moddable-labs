import ChatWebSocketWorker from "ChatWebSocketWorker";
import ElevenLabsAgentModel from "elevenLabsAgentModel";
import config from "mc/config";

class ElevenLabsRealTimeTranscriptionModel extends ElevenLabsAgentModel {
  configure(message) {
    super.configure(message);
    this.audioPrefix  = Object.freeze(new Uint8Array(ArrayBuffer.fromString(`{"message_type":"input_audio_chunk","commit":"false","sample_rate":"16000","audio_base_64":"`)), true);
    this.path = "/v1/speech-to-text/realtime?model_id=scribe_v2_realtime&audio_format=pcm_16000&language_code=en&commit_strategy=vad&vad_silence_threshold_secs=0.4&vad_threshold=0.2";
    const apiKey = message.apiKey ?? config.elevenLabsKey;
    this.headers = [
      ["xi-api-key", apiKey]
    ];
  }
  connect(message) {
    ChatWebSocketWorker.prototype.connect.call(this, message);
  }
  onJSON(json) {
    const type = json.message_type;
    if (type in this)
      this[type](json);
  }
  'session_started'(message) {
    this.post("connected");
  }
  'partial_transcript'(message) {
    trace(`partial_transcript: ${message.text}\n`);
  }
  'committed_transcript'(message) {
    trace(`committed_transcript: ${message.text}\n`);
  }
}

new ElevenLabsRealTimeTranscriptionModel({
  inputSampleRate: 8000,
});
