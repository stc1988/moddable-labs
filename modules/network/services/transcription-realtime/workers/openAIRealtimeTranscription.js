import OpenAIRealTimeModel from "openAIRealtimeModel";
import config from "mc/config"

class OpenAIRealTimeTranscriptionModel extends OpenAIRealTimeModel {
    configure(message) {
        super.configure(message);
        this.path = "/v1/realtime?intent=transcription";
        const apiKey = message.apiKey ?? config.openAIKey;
        this.headers = [
            ["Authorization", `Bearer ${apiKey}`]
        ];
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
                        type: "far_field",
                    },
                    turn_detection: {
                        // type: "semantic_vad"
                        type: "server_vad",
                        threshold: 0.5,
                        prefix_padding_ms: 200,
                        silence_duration_ms: 150,
                    },
                },
            },
        }
    }
    // "conversation.item.input_audio_transcription.delta"(message) {
    //   trace(message.delta + "\n");
    // }
    "input_audio_buffer.speech_started"(message) {
        trace("Speech started\n");
    }
    "input_audio_buffer.speech_stopped"(message) {
        trace("Speech stopped\n");
    }
}

new OpenAIRealTimeTranscriptionModel({
    inputSampleRate: 8000
});