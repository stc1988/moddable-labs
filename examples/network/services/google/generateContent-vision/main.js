import config from "mc/config";
import { fetch, Headers } from "fetch";
import Resource from "Resource";

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

const image = new Uint8Array(new Resource("profile.png"));
const chatCompletion = await completions({
  contents: [
    {
      parts: [
        {
          inlineData: {
            mimeType: "image/png",
            data: image.toBase64(),
          },
        },
      ],
    },
  ],
});

trace(`${chatCompletion}\n`);
