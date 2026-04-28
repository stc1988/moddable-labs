import AudioIn from "embedded:io/audio/in";
import Worker from "worker";

function computeLevel(buffer) {
  return native("xs_computeLevel").call(this, buffer);
}

class AudioTranscription {
  static FAILED = -1;
  static DISCONNECTED = 0;
  static DISCONNECTING = 1;
  static CONNECTING = 2;
  static CONNECTED = 3;
  static SPEAKING = 4; // user is speaking (sending audio to cloud)
  static LISTENING = 5; // user is listening (receiving audio from cloud)
  static WAITING = 6;
  static states = [
    "DISCONNECTED",
    "DISCONNECTING",
    "CONNECTING",
    "CONNECTED",
    "SPEAKING",
    "LISTENING",
    "WAITING",
  ];
  static {
    AudioTranscription.states[-1] = "FAILED";
    Object.freeze(AudioTranscription.states);
  }

  constructor(options) {
    this.error = "";
    this.state = AudioTranscription.DISCONNECTED;

    this.input = null;
    this.inputBufferOffset = 0;
    this.inputBufferSize = 512 * 1024;
    this.inputBuffer = new SharedArrayBuffer(this.inputBufferSize);
    this.inputSampleRate = 24000;
    this.ready = false;

    this.outputBufferSize = 512 * 1024;
    this.outputBuffer = new SharedArrayBuffer(512);
    this.barrier = new Int32Array(new SharedArrayBuffer(4));

    this.level = 0;
    this.microphone = 1;
    this.volume = 1;

    const callback = () => {};
    this.onInputLevelChanged = options.onInputLevelChanged ?? callback;
    this.onInputTranscript = options.onInputTranscript ?? callback;
    this.onStateChanged = options.onStateChanged ?? callback;

    this.createWorker(
      options.specifier,
      options.instructions,
      options.functions,
      options.voiceID,
      options.providerID,
      options.modelID,
    );
  }
  close() {
    this.worker?.terminate();
    this.worker = null;
    this.input?.close();
    this.input = null;
  }
  changeMicrophone(microphone) {
    this.microphone = microphone;
  }
  changeVolume(volume) {
    this.volume = volume;
  }
  createWorker(
    specifier,
    instructions,
    functions,
    voiceID,
    providerID,
    modelID,
  ) {
    this.worker = new Worker(specifier, {
      static: 512 * 1024,
      chunk: {
        initial: 64 * 1024,
        incremental: 8 * 1024,
      },
      heap: {
        initial: 1024,
        incremental: 256,
      },
      stack: 1024,
    });
    this.worker.onmessage = (message) => {
      this[message.id](message);
    };
    this.worker.postMessage({
      id: "configure",
      instructions,
      functions,
      voiceID,
      providerID,
      modelID,
    });
    this.ensureInput();
  }
  configureAudio(message) {
    const inputSampleRate = message.inputSampleRate ?? 24000;
    if (this.inputSampleRate !== inputSampleRate) {
      this.inputSampleRate = inputSampleRate;
      if (this.input) {
        this.input.close();
        this.input = null;
        this.ensureInput();
      }
    }
  }
  connect() {
    this.state = AudioTranscription.CONNECTING;
    this.inputBufferOffset = 0;
    Atomics.store(this.barrier, 0, 0);
    this.worker.postMessage({
      id: "connect",
      inputBuffer: this.inputBuffer,
      outputBuffer: this.outputBuffer,
      barrier: this.barrier,
    });
    this.onStateChanged(this.state);
  }
  connected() {
    this.state = AudioTranscription.CONNECTED;
    this.onStateChanged(this.state);
    this.state = AudioTranscription.SPEAKING;
    if (this.ready) this.onStateChanged(this.state);
  }
  disconnect() {
    this.state = AudioTranscription.DISCONNECTING;
    this.worker.postMessage({ id: "disconnect" });
    this.onStateChanged(this.state);
  }
  disconnected() {
    this.error = "";
    this.state = AudioTranscription.DISCONNECTED;
    this.ensureInput();
    this.onStateChanged(this.state);
  }
  failed(message) {
    this.error = message.string;
    this.state = AudioTranscription.FAILED;
    this.ensureInput();
    this.onStateChanged(this.state);
  }
  listen() {
    if (this.state === AudioTranscription.SPEAKING) {
      this.state = AudioTranscription.LISTENING;
      this.onStateChanged(this.state);
    }
  }
  receiveInputText(message) {
    this.onInputTranscript(message.text, message.more);
  }
  speak() {
    this.state = AudioTranscription.WAITING;
  }

  ensureInput() {
    if (this.input) return;
    const when = Date.now() + 500;
    this.input = new AudioIn({
      sampleRate: this.inputSampleRate,
      onReadable: (size) => {
        if (!this.ready) {
          if (Date.now() >= when) {
            this.ready = true;
            if (this.state !== AudioTranscription.DISCONNECTED)
              this.onStateChanged(this.state);
          } else return;
        }
        if (!this.microphone) return;
        let delta = this.inputBufferSize - this.inputBufferOffset;
        if (delta < size) {
          this.inputBufferOffset = 0;
          delta = this.inputBufferSize;
        }
        const samples = new Uint8Array(
          this.inputBuffer,
          this.inputBufferOffset,
          size,
        );
        this.input.read(samples);
        const level = computeLevel(samples);
        if (this.level !== level) {
          this.level = level;
          this.onInputLevelChanged(level);
        }
        if (this.state === AudioTranscription.SPEAKING) {
          this.worker.postMessage({
            id: "sendAudio",
            offset: this.inputBufferOffset,
            size,
          });
        }
        this.inputBufferOffset += size;
      },
    });
    this.input.start();
  }
}

export default AudioTranscription;
