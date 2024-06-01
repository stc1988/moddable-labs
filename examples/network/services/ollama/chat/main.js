import config from "mc/config";
import completions from "completions";

// API specification: https://github.com/ollama/ollama/blob/main/docs/api.md

const host = config.host;

try {
  const chatCompletion = await completions({
    host,
    body: {
      model: "llama3",
      stream: false,
      messages: [{ role: "user", content: "why is the sky blue in short?" }],
    },
  });

  trace(`${chatCompletion}\n`);
} catch (error) {
  trace(`API Error: ${error.status} - ${error.statusText}`);
}
