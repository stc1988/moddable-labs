import config from "mc/config";
import { fetch, Headers } from "fetch";
import Resource from "Resource";

// API specification: https://platform.openai.com/docs/guides/text-generation/chat-completions-api

async function completions(apiKey, model, content, image) {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: new Headers([
      ["Content-Type", "application/json"],
      ["Authorization", `Bearer ${apiKey}`],
    ]),
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: content,
            },
            {
              type: "image_url",
              image_url: {
                url: `data:image/jpeg;base64,${image.toBase64()}`,
              },
            },
          ],
        },
      ],
    }),
  });
  const text = await response.text();
  const obj = JSON.parse(text, ["choices", "message", "content"]);
  return obj.choices[0].message.content;
}

const content = await completions(
  config.api_key,
  "gpt-4o",
  "What’s in this image?",
  new Uint8Array(new Resource("profile.png"))
);

trace(`${content}\n`);
