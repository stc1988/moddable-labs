import config from "mc/config";
import Resource from "Resource";
import completions from "completions";

const apiKey = config.api_key;
const image = new Uint8Array(new Resource("profile.png"));

try {
  const chatCompletion = await completions({
    apiKey,
    body: {
      model: "claude-3-haiku-20240307",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: "image/png",
                data: image.toBase64(),
              },
            },
            { type: "text", text: "What is in this image?" },
          ],
        },
      ],
    },
  });

  trace(`${chatCompletion}\n`);
} catch (error) {
  debugger;
  trace(`API Error: ${error.status} - ${error.statusText}`);
}
