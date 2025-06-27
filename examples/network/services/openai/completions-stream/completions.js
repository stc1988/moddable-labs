import EventSource from "eventsource";
import Headers from "headers";
import * as streams from "streams";
// biome-ignore lint: Moddable way
for (const key in streams) globalThis[key] = streams[key];

// API specification: https://platform.openai.com/docs/guides/text-generation/chat-completions-api

function completions(options) {
  const { baseURL, apiKey, body, ...o } = options;
  const headers = new Headers([["Content-Type", "application/json"]]);
  if (apiKey) headers.set("Authorization", `Bearer ${apiKey}`);

  return new ReadableStream({
    start(controller) {
      const source = new EventSource(
        `${baseURL ?? "https://api.openai.com/v1/"}chat/completions`,
        {
          method: "POST",
          headers,
          body: typeof body === "string" ? body : JSON.stringify(body),
        },
      );
      source.onmessage = (e) => {
        if (e.data === "[DONE]") {
          source.close();
          controller.close();
        } else {
          const obj = JSON.parse(e.data, ["choices", "delta", "content"]);
          controller.enqueue(obj.choices[0].delta.content);
        }
      };
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
