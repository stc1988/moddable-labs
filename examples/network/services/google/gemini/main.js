import config from "mc/config";
import { fetch, Headers } from "fetch";

const apiKey = config.api_key;
const headers = new Headers([["Content-Type", "application/json"]]);
const model = "gemini-1.5-flash-latest";
const body = JSON.stringify({
  "contents" :[
    {"parts":[{"text": "Tell me about Moddable SDK in short."}]}
  ]
});

const response = await fetch(
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
  {
    method: "POST",
    headers,
    body,
  }
);
const json = await response.json();
trace(`${json.candidates[0].content.parts[0].text}\n`);
