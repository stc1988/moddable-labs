import config from "mc/config";
import { fetch, Headers } from "fetch";

// API specification: https://ai.google.dev/api/rest/v1beta/models/generateContent

async function completions(apiKey, model, content) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: new Headers([["Content-Type", "application/json"]]),
      body: JSON.stringify({
        contents: [{ parts: [{ text: content }] }],
      }),
    }
  );
  const json = await response.json();
  return json.candidates[0].content.parts[0].text
}

const content = await completions(
  config.api_key,
  "gemini-1.5-flash-latest",
  "Tell me about Moddable SDK in short."
);

trace(`${content}\n`);
