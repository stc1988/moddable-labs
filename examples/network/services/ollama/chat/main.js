import config from "mc/config";
import { fetch, Headers } from "fetch";

// API specification: https://github.com/ollama/ollama/blob/main/docs/api.md

const host = config.host;

async function completions(body) {
  const response = await fetch(`${host}/api/chat`, {
    method: "POST",
    headers: new Headers([["Content-Type", "application/json"]]),
    body: JSON.stringify(body),
  });
  const text = await response.text();
  const obj = JSON.parse(text, ["message", "content"]);
  return obj.message.content;
}

const chatCompletion = await completions({
  model: "llama3",
  stream: false,
  messages: [{ role: "user", content: "why is the sky blue in short?" }],
});

trace(`${chatCompletion}\n`);
