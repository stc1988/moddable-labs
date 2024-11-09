import completions from "completions";

// API specification: https://ollama.com/blog/openai-compatibility

try {
  const chatCompletion = await completions({
    baseURL: "http://localhost:11434/v1/",
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
