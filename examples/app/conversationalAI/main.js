import ChatAudioIO from "ChatAudioIO";

const STATES = {
  FAILED: ChatAudioIO.FAILED,
  DISCONNECTED: ChatAudioIO.DISCONNECTED,
  CONNECTING: ChatAudioIO.CONNECTING,
  DISCONNECTING: ChatAudioIO.DISCONNECTING,
  SPEAKING: ChatAudioIO.SPEAKING,
  LISTENING: ChatAudioIO.LISTENING,
  WAITING: ChatAudioIO.WAITING,
};

const stateMap = new Map(
  Object.entries(STATES).map(([key, value]) => [value, key]),
);

let silince = true;
let currentState;
let inputTranscript = "";
let outputTranscript = "";

const chat = new ChatAudioIO({
  specifier: "openAIRealtime",
  instructions: "あなたは親切なロボットです。お話しましょう",
  voiceName: "sage",
  onStateChanged: (state) => {
    const s = stateMap.get(state);
    trace(`[onStateChanged]${currentState} => ${s}\n`);

    switch (s) {
      case "SPEAKING":
        silince = true;
        inputTranscript = "";
        outputTranscript = "";
        break;
      case "FAILED":
        trace(`${chat.error}\n}`);
        break;
    }
    if (currentState === "LISTENING") {
      trace("[onStateChanged]output end\n");
    }
    currentState = s;
  },
  onInputLevelChanged: (level) => {
    // trace(`[onInputLevelChanged]${level}\n`)
    const INPUT_LEVEL_THRESHOLD = 500;
    if (silince && level > INPUT_LEVEL_THRESHOLD) {
      trace(`[onInputLevelChanged] speak detected. level = ${level}\n`);
      silince = false;
    }
  },
  onOutputLevelChanged: (level) => {
    // trace(`[onOutputLevelChanged]${level}\n`)
  },
  onInputTranscript: (text, more) => {
    // trace(`\n[onInputTranscript]${text}, ${more}\n`)
    inputTranscript += text;
    if (!more) trace(`\n[onInputTranscript]\n${inputTranscript}\n`);
  },
  onOutputTranscript: (text, more) => {
    // trace(`\n[onOutputTranscript]${text}, ${more}\n`)
    outputTranscript += text;
    if (!more) trace(`\n[onOutputTranscript]\n${outputTranscript}\n`);
  },
});

chat.connect();
