import EventSource from "eventsource";
import Headers from "headers";
import * as streams from "streams";
for (let key in streams) globalThis[key] = streams[key];

// API specification: https://platform.openai.com/docs/guides/text-generation/chat-completions-api

function completions(options) {
  const { apiKey, body, ...o } = options;
  
  return new ReadableStream({
    start(controller) {
      const source = new EventSource(
        "https://api.openai.com/v1/chat/completions",
        {
          method: "POST",
          headers: new Headers([
            ["Content-Type", "application/json"],
            ["Authorization", `Bearer ${apiKey}`],
          ]),
          body: typeof body === "string" ? body : JSON.stringify(body),
        }
      );
      source.onmessage = function (e) {
        if (e.data == "[DONE]") {
          source.close();
          controller.close();
        } else {
          const obj = JSON.parse(e.data, ["choices", "delta", "content"]);
          controller.enqueue(obj.choices[0].delta.content);
        }
      };
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
