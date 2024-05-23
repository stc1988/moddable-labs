import { fetch, Headers } from "fetch";
import config from "mc/config";

const host = config.host;

function completions(body) {
  return new ReadableStream({
    async start(controller) {
      try {
        const response = await fetch(`${host}/api/chat`, {
          method: "POST",
          headers: new Headers([["Content-Type", "application/json"]]),
          body: JSON.stringify(body),
        });
        const transformedBody = response.body.pipeThrough(
          new TextDecoderStream()
        );
        const reader = transformedBody.getReader();

        async function push() {
          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              controller.close();
              break;
            }
            const obj = JSON.parse(value, [
              "message",
              "role",
              "content",
              "done",
            ]);
            controller.enqueue(obj.message.content);
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
    model: "llama3",
    stream: true,
    messages: [{ role: "user", content: "why is the sky blue in short?" }],
  });
  for await (const chunk of stream) {
    trace(chunk);
  }
}

main();
