import config from "mc/config";
import { fetch, Headers } from "fetch";
import Resource from "Resource";

// API specification: https://platform.openai.com/docs/guides/text-generation/chat-completions-api

const apiKey = config.api_key;

async function completions(body) {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: new Headers([
      ["Content-Type", "application/json"],
      ["Authorization", `Bearer ${apiKey}`],
    ]),
    body: JSON.stringify(body),
  });
  const text = await response.text();
  const obj = JSON.parse(text, ["choices", "message", "content"]);
  return obj.choices[0].message.content;
}

const image = new Uint8Array(new Resource("profile.png"));
const chatCompletion = await completions(
  {
    model: "gpt-4o",
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "What’s in this image?",
          },
          {
            type: "image_url",
            image_url: {
              url: `data:image/jpeg;base64,${image.toBase64()}`,
            },
          },
        ],
      },
    ]
  }
);

trace(`${chatCompletion}\n`);
