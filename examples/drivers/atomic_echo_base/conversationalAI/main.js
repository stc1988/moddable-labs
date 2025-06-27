import ChatAudioIO from "ChatAudioIO";

const chat = new ChatAudioIO({
  specifier: "openAIRealtime",
  voiceName: "alloy",
  instructions:
    "You're a hostile fisherman with a salty sense of humor. You dislike people and care even less for fish.",
  onStateChanged(state) {
    trace(`State: ${ChatAudioIO.states[state]} ${this.error ?? ""}\n`);
  },
  onInputTranscript(text) {
    trace(`User: ${text}\n`);
  },
  onOutputTranscript(text) {
    trace(`Agent: ${text}\n`);
  },
});
chat.connect();
