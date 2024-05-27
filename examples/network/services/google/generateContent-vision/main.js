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
      body: body,
    }
  );
  const json = await response.json();
  return json.candidates[0].content.parts[0].text;
}

let image = new Uint8Array(new Resource("profile.png"));
let body =
  '{"contents":[{"parts":[{ text: "What’s in this image?" },{"inlineData":{"mimeType":"image/png","data":"' +
  image.toBase64() +
  '"}}]}],"systemInstruction": {"parts": [{ "text": "Must answer within 3 sentenses." }],}}';
image = null;
const chatCompletion = await completions(body);

trace(`${chatCompletion}\n`);
