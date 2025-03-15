import ChatAudioIO from "ChatAudioIO";

const stateMap = new Map([
  [-1, "FAILED"],
  [0, "DISCONNECTED"],
  [1, "DISCONNECTING"],
  [2, "CONNECTED"],
  [3, "CONNECTING"],
  [4, "LISTENING"],
  [5, "SPEAKING"],
]);

let currentState;
let silince = true;
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
      case "LISTENING":
        silince = true;
        inputTranscript = "";
        outputTranscript = "";
        break;
    }
    if (currentState === "LISTENING") {
      trace("[onStateChanged]output end\n");
    }
    currentState = s;
  },
  onInputLevelChanged: (level) => {
    if (silince && level > 500) {
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
