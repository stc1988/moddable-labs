import { fetch, Headers } from "fetch";

// API specification: https://platform.openai.com/docs/guides/text-generation/chat-completions-api

async function completions(options) {
  const { apiKey, body, ...o } = options;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: new Headers([
      ["Content-Type", "application/json"],
      ["Authorization", `Bearer ${apiKey}`],
    ]),
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
  if (response.status === 200) {
    const text = await response.text();
    const obj = JSON.parse(text, ["choices", "message", "content"]);
    return obj.choices[0].message.content;
  }
  const obj = await response.json();
  throw new APIError(response.status, response.statusText, obj);
}

class APIError extends Error {
  constructor(status, statusText, obj) {
    super(`OpenAI API Error: ${status} ${statusText}`);
    this.status = status;
    this.statusText = statusText;
    this.detail = obj.error;
  }
}

export default completions;
