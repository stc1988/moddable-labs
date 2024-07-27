import config from "mc/config";
import completions from "completions";
import Resource from "Resource";

// API specification: https://platform.openai.com/docs/guides/text-generation/chat-completions-api

const apiKey = config.api_key;

let image = new Uint8Array(new Resource("profile.png"));
const body = JSON.stringify({
  model: "gpt-4o-mini",
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
  ],
});
image = null;

try {
  const chatCompletion = await completions({
    apiKey,
    body,
  });

  trace(`${chatCompletion}\n`);
} catch (error) {
  trace(`API Error: ${error.status} - ${error.statusText}`);
}
