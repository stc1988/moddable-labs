import config from "mc/config";
import completions from "completions";

const apiKey = config.api_key;
const model = "gemini-1.5-flash-latest";

try {
  const chatCompletion = await completions({
    apiKey,
    model,
    body: {
      contents: [
        {
          parts: [{ text: "Tell me about Moddable SDK in short." }],
        },
      ],
      systemInstruction: {
        parts: [{ text: "Must answer within 3 sentenses." }],
      },
    },
  });

  trace(`${chatCompletion}\n`);
} catch (error) {
  trace(`API Error: ${error.status} - ${error.statusText}`);
}
