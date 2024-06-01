import config from "mc/config";
import completions from "completions";

const apiKey = config.api_key;

try {
  const chatCompletion = await completions({
    apiKey,
    body: {
      model: "claude-3-haiku-20240307",
      max_tokens: 1024,
      messages: [
        { role: "user", content: "Tell me about Moddable SDK in short." },
      ],
    },
  });

  trace(`${chatCompletion}\n`);
} catch (error) {
  debugger;
  trace(`API Error: ${error.status} - ${error.statusText}`);
}
