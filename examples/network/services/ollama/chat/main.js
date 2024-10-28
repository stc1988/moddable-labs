import config from "mc/config";
import completions from "completions";

// API specification: https://ollama.com/blog/openai-compatibility

const baseURL = config.base_url;

try {
  const chatCompletion = await completions({
    baseURL,
    body: {
      model: "llama3.2",
      stream: false,
      messages: [{ role: "user", content: "why is the sky blue in short?" }],
    },
  });

  trace(`${chatCompletion}\n`);
} catch (error) {
  trace(`API Error: ${error.status} - ${error.statusText}`);
}
