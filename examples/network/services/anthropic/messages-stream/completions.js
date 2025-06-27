import EventSource from "eventsource";
import Headers from "headers";
import * as streams from "streams";
// biome-ignore lint: Moddable way
for (const key in streams) globalThis[key] = streams[key];

// API specification: https://docs.anthropic.com/en/api/messages

function completions(options) {
  const { apiKey, body, ...o } = options;

  return new ReadableStream({
    start(controller) {
      const source = new EventSource("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: new Headers([
          ["Content-Type", "application/json"],
          ["x-api-key", apiKey],
          ["anthropic-version", "2023-06-01"],
        ]),
        body: typeof body === "string" ? body : JSON.stringify(body),
      });
      source.addEventListener("content_block_delta", (e) => {
        const obj = JSON.parse(e.data, ["delta", "text"]);
        controller.enqueue(obj.delta.text);
      });

      source.addEventListener("message_stop", (e) => {
        source.close();
        controller.close();
      });

      source.onerror = (error) => {
        source.close();
        controller.error(new APIError(error.status, error.statusText));
      };
    },
  });
}

class APIError extends Error {
  constructor(status, statusText, obj) {
    super(`OpenAI API Error: ${status} ${statusText}`);
    this.status = status;
    this.statusText = statusText;
    this.detail = obj?.error;
  }
}
export default completions;
