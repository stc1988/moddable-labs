import config from "mc/config";
import { fetch, Headers } from "fetch";

// API specification: https://platform.openai.com/docs/guides/text-generation/chat-completions-api

async function completions(apiKey, model, content) {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: new Headers([
      ["Content-Type", "application/json"],
      ["Authorization", `Bearer ${apiKey}`],
    ]),
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: content }],
    }),
  });
  const text = await response.text();
  const obj = JSON.parse(text, ["choices", "message", "content"]);
  return obj.choices[0].message.content;
}

const content = await completions(
  config.api_key,
  "gpt-3.5-turbo",
  "Tell me about Moddable SDK in short."
);

trace(`${content}\n`);
