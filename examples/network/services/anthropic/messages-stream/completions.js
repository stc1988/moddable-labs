import EventSource from "eventsource";
import Headers from "headers";
import * as streams from "streams";
for (let key in streams) globalThis[key] = streams[key];

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
      source.addEventListener("content_block_delta", function (e) {
        const obj = JSON.parse(e.data, ["delta", "text"]);
        controller.enqueue(obj.delta.text);
      });

      source.addEventListener("message_stop", function (e) {
        source.close();
        controller.close();
      });

      source.onerror = function() {
        source.close();
        controller.close();
        /// TODO Error handling
      };
    },
  });
}

class APIError extends Error {
  constructor(response) {
    super(`OpenAI API Error: ${response.status} ${response.statusText}`);
    this.status = response.status;
    this.statusText = response.statusText;
  }
}

export default completions;

