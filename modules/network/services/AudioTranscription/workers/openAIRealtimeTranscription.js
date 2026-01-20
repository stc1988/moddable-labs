// This is based on openAIRealtime.js

import config from "mc/config";
import ChatWebSocketWorker from "ChatWebSocketWorker";
import { Encode } from "ChatAudioIO/Codecs";

const audioPrefix = Object.freeze(
  new Uint8Array(
    ArrayBuffer.fromString(`{"type":"input_audio_buffer.append","audio":"`),
  ),
  true,
);
const audioSuffix = Object.freeze(
  new Uint8Array(ArrayBuffer.fromString('"}')),
  true,
);

class OpenAIRealTimeModel extends ChatWebSocketWorker {
  constructor(options) {
    super(options);
    this.host = "api.openai.com";
    this.path = "/v1/realtime?intent=transcription";
    this.headers = [["Authorization", `Bearer ${config.openAIKey}`]];
    this.audioPrefix = audioPrefix;
    this.audioSuffix = audioSuffix;
  }
  configure(message) {
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
            type: "near_field",
          },
          turn_detection: {
            type: "server_vad",
            threshold: 0.5,
            prefix_padding_ms: 300,
            silence_duration_ms: 500,
          },
        },
      },
    };
  }
  generateId(prefix, length = 21) {
    // base58; non-repeating chars
    const chars = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
    const str = Array(length - prefix.length)
      .fill(0)
      .map((_) => chars[Math.floor(Math.random() * chars.length)])
      .join("");
    return `${prefix}${str}`;
  }
  isBase64(result, current, name) {
    return result?.type === "response.output_audio.delta" && name === "delta";
  }
  sendAudio(message) {
    const buffer = new Uint8Array(
      this.inputBuffer,
      message.offset,
      message.size,
    );
    Encode.toAlaw(buffer, buffer);
    message.size >>= 1;
    return super.sendAudio(message);
  }
  onJSON(json) {
    if ("failed" === json.response?.status) {
      this.postMessage({
        id: "failed",
        string:
          json.response.status_details?.error?.message ?? `${json.type} failed`,
      });
      return void this.close();
    }
    return super.onJSON(json);
  }
  //   "conversation.item.input_audio_transcription.delta"(message) {
  //     trace(message.delta + "\n");
  //   }
  "conversation.item.input_audio_transcription.completed"(message) {
    this.postMessage({ id: "receiveInputText", text: message.transcript });
  }
  error(message) {
    this.postMessage({ id: "failed", string: message.error.message });
    this.close();
  }
  "input_audio_buffer.committed"(message) {}
  "session.created"(message) {
    this.sendJSON({
      type: "session.update",
      session: this.session,
      event_id: this.generateId("event_"),
    });
  }
  "session.updated"(message) {
    this.post("connected");
  }
}

new OpenAIRealTimeModel({
  inputSampleRate: 8000,
});
