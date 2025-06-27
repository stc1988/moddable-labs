import config from "mc/config";
import recordWav from "recordWav";
import transcription from "transcription";

const apiKey = config.api_key;

async function main() {
  const audio = await recordWav();
  try {
    const audioTranscription = await transcription({
      apiKey,
      audio,
    });
    trace(`${audioTranscription}\n`);
  } catch (error) {
    trace(`API Error: ${error.status} - ${error.statusText}`);
  }
}

main();
