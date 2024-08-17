import { fetch, Headers } from "fetch";
import config from "mc/config";
// API specification: https://ai.google.dev/api/rest/v1beta/models/streamGenerateContent

const apiKey = config.api_key;
const model = "gemini-1.5-flash-latest";

function completions(body) {
  return new ReadableStream({
    async start(controller) {
      try {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?key=${apiKey}`,
          {
            method: "POST",
            headers: new Headers([["Content-Type", "application/json"]]),
            body: JSON.stringify(body),
          },
        );
        const transformedBody = response.body.pipeThrough(
          new TextDecoderStream(),
        );
        const reader = transformedBody.getReader();

        async function push() {
          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              controller.close();
              break;
            }

            if (value.startsWith("[") || value.startsWith(",")) {
              const obj = JSON.parse(value.slice(1), [
                "candidates",
                "content",
                "parts",
                "text",
              ]);
              controller.enqueue(obj.candidates[0].content.parts[0].text);
            } else if (value.startsWith("]")) {
              controller.close();
              break;
            }
          }
        }

        push().catch((error) => {
          controller.error(error);
        });
      } catch (error) {
        controller.error(error);
      }
    },
  });
}

async function main() {
  const stream = completions({
    contents: [{ parts: [{ text: "Tell me about Moddable SDK in short." }] }],
  });
  for await (const chunk of stream) {
    trace(chunk);
  }
}

main();
