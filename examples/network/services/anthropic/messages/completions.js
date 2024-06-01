import { fetch, Headers } from "fetch";

// API specification: https://docs.anthropic.com/en/api/messages

async function completions(options) {
  const { apiKey, body, ...o } = options;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: new Headers([
      ["Content-Type", "application/json"],
      ["x-api-key", apiKey],
      ["anthropic-version", "2023-06-01"],
    ]),
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
  if (response.status == 200) {
    const text = await response.text();
    const obj = JSON.parse(text, ["content", "text"]);
    return obj.content[0].text;
  } else {
    const obj = await response.json();
    throw new APIError(response.status, response.statusText, obj);
  }
}

class APIError extends Error {
  constructor(status, statusText, obj) {
    super(`Anthropic API Error: ${status} ${statusText}`);
    this.status = status;
    this.statusText = statusText;
    this.detail = obj.error;
  }
}

export default completions;
