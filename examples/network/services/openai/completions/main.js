import config from "mc/config";
import { fetch, Headers } from "fetch";

// API specification: https://platform.openai.com/docs/guides/text-generation/chat-completions-api

const apiKey = config.api_key;

async function completions(body) {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: new Headers([
      ["Content-Type", "application/json"],
      ["Authorization", `Bearer ${apiKey}`],
    ]),
    body: JSON.stringify(body),
  });
  const text = await response.text();
  const obj = JSON.parse(text, ["choices", "message", "content"]);
  return obj.choices[0].message.content;
}

const chatCompletion = await completions({
  model: "gpt-3.5-turbo",
  messages: [{ role: "user", content: "Tell me about Moddable SDK in short." }],
});

trace(`${chatCompletion}\n`);
