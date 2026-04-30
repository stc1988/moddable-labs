import ChatAudioIO from "ChatAudioIO";

let partial = "";
const specifier = "elevenLabsRealtimeTranscription";
// const specifier = "openAIRealtimeTranscription";

const chat = new ChatAudioIO({
  specifier,
  onStateChanged(state) {
    trace(`State: ${ChatAudioIO.states[state]} ${this.error ?? ""}\n`);
  },

  onInputTranscript(text, more) {
    if (more) {
      if (specifier === "elevenLabsRealtimeTranscription") {
        trace(`User (partial): ${text}\n`);
      } else {
        if (partial === "") {
          trace("User (delta):");
        }
        partial += text;
        trace(text);
      }
    } else {
      trace(`\nUser (end): ${text}\n`);
      partial = "";
    }
  },
});
chat.connect();
