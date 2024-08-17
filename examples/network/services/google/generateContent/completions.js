import { fetch, Headers } from "fetch";

// API specification: https://ai.google.dev/api/rest/v1beta/models/generateContent

async function completions(options) {
  const { apiKey, model, body, ...o } = options;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: new Headers([["Content-Type", "application/json"]]),
      body: typeof body === "string" ? body : JSON.stringify(body),
    },
  );
  if (response.status === 200) {
    const json = await response.json();
    return json.candidates[0].content.parts[0].text;
  }
  const obj = await response.json();
  throw new APIError(response.status, response.statusText, obj);
}

class APIError extends Error {
  constructor(status, statusText, obj) {
    super(`Google API Error: ${status} ${statusText}`);
    this.status = status;
    this.statusText = statusText;
    this.detail = obj.error;
  }
}

export default completions;
