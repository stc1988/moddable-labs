import config from "mc/config";
import { fetch, Headers } from "fetch";

// API specification: https://ai.google.dev/api/rest/v1beta/models/generateContent

const apiKey = config.api_key;
const model = "gemini-1.5-flash-latest";

async function completions(body) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: new Headers([["Content-Type", "application/json"]]),
      body: JSON.stringify(body),
    }
  );
  const json = await response.json();
  return json.candidates[0].content.parts[0].text;
}

const chatCompletion = await completions({
  contents: [
    {
      parts: [{ text: "Tell me about Moddable SDK in short." }],
    },
  ],
  systemInstruction: {
    parts: [{ text: "Must answer within 3 sentenses." }],
  },
});

trace(`${chatCompletion}\n`);
