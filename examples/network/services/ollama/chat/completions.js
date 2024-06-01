import { fetch, Headers } from "fetch";

// API specification: https://github.com/ollama/ollama/blob/main/docs/api.md

async function completions(options) {
  const { host, body, ...o } = options;

  const response = await fetch(`${host}/api/chat`, {
    method: "POST",
    headers: new Headers([["Content-Type", "application/json"]]),
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
  if (response.status == 200) {
    const text = await response.text();
    const obj = JSON.parse(text, ["message", "content"]);
    return obj.message.content;
  } else {
    const obj = await response.json()
    throw new APIError(response.status, response.statusText, obj);
  }
}

class APIError extends Error {
  constructor(status, statusText, obj) {
    super(`Ollama API Error: ${status} ${statusText}`);
    this.status = status;
    this.statusText = statusText;
    this.detail = obj.error;
  }
}

export default completions;
