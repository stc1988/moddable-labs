import config from "mc/config";
import { fetch, Headers } from "fetch";

const apiKey = config.api_key;
const headers = new Headers([
  ["Content-Type", "application/json"],
  ["x-api-key", apiKey],
  ["anthropic-version", "2023-06-01"],
]);
const body = JSON.stringify({
  model: "claude-3-haiku-20240307",
  max_tokens: 256,
  messages: [{ role: "user", content: "Tell me about Moddable SDK in short." }],
});

const response = await fetch("https://api.anthropic.com/v1/messages", {
  method: "POST",
  headers,
  body,
});
const json = await response.json();
trace(`${json.content[0].text}\n`);
