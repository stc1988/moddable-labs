import config from "mc/config";
import { fetch, Headers } from "fetch";

// API specification: https://github.com/ollama/ollama/blob/main/docs/api.md

async function completions(host, model, content) {
  const response = await fetch(`${host}/api/chat`, {
    method: "POST",
    headers: new Headers([["Content-Type", "application/json"]]),
    body: JSON.stringify({
      model,
      stream: false,
      messages: [{ role: "user", content: content }],
    }),
  });
  const text = await response.text();
  const obj = JSON.parse(text, ["message", "content"]);
  return obj.message.content;
}

const content = await completions(
  config.host,
  "llama3",
  "why is the sky blue in short?"
);

trace(`${content}\n`);
