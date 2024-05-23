import config from "mc/config";
import { fetch, Headers } from "fetch";

// API specification: https://docs.anthropic.com/en/api/messages

const apiKey = config.api_key;

async function completions(body) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: new Headers([
      ["Content-Type", "application/json"],
      ["x-api-key", apiKey],
      ["anthropic-version", "2023-06-01"],
    ]),
    body: JSON.stringify(body),
  });
  const text = await response.text();
  const obj = JSON.parse(text, ["content", "text"]);
  return obj.content[0].text;
}

const chatCompletion = await completions({
  model: "claude-3-haiku-20240307",
  max_tokens: 1024,
  messages: [{ role: "user", content: "Tell me about Moddable SDK in short." }],
});

trace(`${chatCompletion}\n`);
