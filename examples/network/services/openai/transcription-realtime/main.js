import AudioTranscription from "AudioTranscription";

const chat = new AudioTranscription({
  specifier: "openAIRealtimeTranscription",
  onStateChanged(state) {
    trace(`State: ${AudioTranscription.states[state]} ${this.error ?? ""}\n`);
  },
  onInputTranscript(text) {
    trace(`User: ${text}\n`);
  },
});
chat.connect();
