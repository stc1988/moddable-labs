import config from "mc/config";
import completions from "completions";

const apiKey = config.api_key;

try {
  const chatCompletion = await completions({
    apiKey,
    body: {
      model: "gpt-4o-mini",
      messages: [
        { role: "user", content: "Tell me about Moddable SDK in short." },
      ],
    },
  });

  trace(`${chatCompletion}\n`);
} catch (error) {
  trace(`API Error: ${error.status} - ${error.statusText}`);
}
