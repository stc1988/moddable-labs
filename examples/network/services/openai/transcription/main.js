import config from "mc/config";
import transcription from "transcription";
import Resource from "Resource";

const apiKey = config.api_key;

const audio = new Resource("speech2.wav");

try {
  const audioTranscription = await transcription({
    apiKey,
    audio,
  });
  trace(`${audioTranscription}\n`);
} catch (error) {
  trace(`API Error: ${error.status} - ${error.statusText}`);
}
