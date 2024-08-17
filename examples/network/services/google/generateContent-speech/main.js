import config from "mc/config";
import Resource from "Resource";
import completions from "completions";

const apiKey = config.api_key;
const model = "gemini-1.5-flash-latest";

try {
  let audio = new Uint8Array(new Resource("speech.wav"));
  const body =
    '{"contents":[{"parts":[{"inlineData":{"mimeType":"audio/wav","data":"' +
    audio.toBase64() +
    '"}}]}],"systemInstruction": {"parts": [{ "text": "Must answer within 3 sentenses." }],}}';

  audio = null;

  const chatCompletion = await completions({
    apiKey,
    model,
    body,
  });

  trace(`${chatCompletion}\n`);
} catch (error) {
  trace(`API Error: ${error.status} - ${error.statusText}`);
}
