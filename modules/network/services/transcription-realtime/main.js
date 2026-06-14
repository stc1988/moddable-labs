import ChatAudioIO from "ChatAudioIO";

let partial;
const VAD_SILENCE_LEVEL = 300;
const VAD_SILENCE_DURATION = 500;
let silenceSince;
let silenceNotified = false;
// const specifier = "elevenLabsRealtimeTranscription";
// const specifier = "openAIRealtimeTranscription";
const specifier = "googleGeminiLiveTranscription"

const chat = new ChatAudioIO({
  specifier,
  onStateChanged(state) {
    trace(`State: ${ChatAudioIO.states[state]} ${this.error ?? ""}\n`);
  },

  onInputTranscript(text, more) {
    if (specifier === "elevenLabsRealtimeTranscription") {
      trace(`User (${more ? "(partial)" : "(end)"}): ${text}\n`);
    } else if (specifier === "openAIRealtimeTranscription") {
      if (more) {
        if (!partial) {
          trace(`User (partial): ${text}`);
        } else {
          trace(`${text}`);
        }
        partial += text;
      } else {
        trace(`\nUser (end): ${text}\n`);
        partial = undefined;
      }
    }
  },
  onInputLevelChanged(level) {
    // detect Client VAD based on input level
    // trace(`Input level: ${level}\n`);
    const now = Date.now();
    if (level <= VAD_SILENCE_LEVEL) {
      silenceSince ??= now;
      if (!silenceNotified && now - silenceSince >= VAD_SILENCE_DURATION) {
        // trace(`Input level silent for ${VAD_SILENCE_DURATION} ms: ${level}\n`);
        silenceNotified = true;
        this.worker.postMessage({ id: "input_commit" });
      }
    } else {
      silenceSince = undefined;
      silenceNotified = false;
    }
  },
});
chat.connect();
