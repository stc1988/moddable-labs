import ChatAudioIO from "ChatAudioIO";

const chat = new ChatAudioIO({
	specifier: "openAIRealtimeTranscription",
	onStateChanged(state) {
		trace(`State: ${ChatAudioIO.states[state]} ${this.error ?? ""}\n`);
	},
	onInputTranscript(text) {
		trace(`User: ${text}\n`);
	}
});
chat.connect();