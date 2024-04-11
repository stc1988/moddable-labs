import config from "mc/config";
import { fetch, Headers } from "fetch";

const apiKey = config.api_key;
const headers = new Headers([
  ["Content-Type", "application/json"],
  ["Authorization", `Bearer ${apiKey}`],
]);
const body = JSON.stringify({
  model: "gpt-3.5-turbo",
  messages: [{ role: "user", content: "Say this is a test" }],
});

const response = await fetch("https://api.openai.com/v1/chat/completions", {
  method: "POST",
  headers,
  body,
});
const json = await response.json();

trace(`${json.choices[0].message.content}\n`);
