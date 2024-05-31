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
  if (response.status == 200) {
    const text = await response.text();
    const obj = JSON.parse(text, ["choices", "message", "content"]);
    return obj.choices[0].message.content;
  } else {
    throw new APIError(response);
  }
}

class APIError extends Error {
  constructor(response) {
    super(`OpenAI API Error: ${response.status} ${response.statusText}`);
    this.status = response.status;
    this.statusText = response.statusText;
  }
}

export default completions;
