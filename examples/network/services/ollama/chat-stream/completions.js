import { fetch, Headers } from "fetch";

// API specification: https://github.com/ollama/ollama/blob/main/docs/api.md

function completions(options) {
  const { host, body, ...o } = options;

  return new ReadableStream({
    async start(controller) {
      try {
        const response = await fetch(`${host}/api/chat`, {
          method: "POST",
          headers: new Headers([["Content-Type", "application/json"]]),
          body: JSON.stringify(body),
        });

        if (response.status == 200) {
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
        } else {
          const obj = await response.json();
          controller.error(
            new APIError(response.status, response.statusText, obj)
          );
        }
      } catch (error) {
        controller.error(error);
      }
    },
  });
}

class APIError extends Error {
  constructor(status, statusText, obj) {
    super(`Ollama API Error: ${status} ${statusText}`);
    this.status = status;
    this.statusText = statusText;
    this.detail = obj.error;
  }
}

export default completions;
