import config from "mc/config";
import { fetch, Headers } from "fetch";

// API specification: https://docs.anthropic.com/en/api/messages

async function completions(apiKey, model, content) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: new Headers([
      ["Content-Type", "application/json"],
      ["x-api-key", apiKey],
      ["anthropic-version", "2023-06-01"],
    ]),
    body: JSON.stringify({
      model,
      max_tokens: 256,
      messages: [{ role: "user", content: content }],
    }),
  });
  const text = await response.text();
  const obj = JSON.parse(text, ["content", "text"]);
  return obj.content[0].text;
}

const content = await completions(
  config.api_key,
  "claude-3-haiku-20240307",
  "Tell me about Moddable SDK in short."
);

trace(`${content}\n`);
