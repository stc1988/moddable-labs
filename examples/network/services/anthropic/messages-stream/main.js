import config from "mc/config";
import EventSource from "eventsource";
import Headers from "headers";
import * as streams from "streams";
for (let key in streams) globalThis[key] = streams[key];

// API specification: https://docs.anthropic.com/en/api/messages

const apiKey = config.api_key;

function completions(body) {
  return new ReadableStream({
    start(controller) {
      const source = new EventSource("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: new Headers([
          ["Content-Type", "application/json"],
          ["x-api-key", apiKey],
          ["anthropic-version", "2023-06-01"],
        ]),
        body: JSON.stringify(body),
      });
      source.addEventListener("content_block_delta", function (e) {
        const obj = JSON.parse(e.data, ["delta", "text"]);
        controller.enqueue(obj.delta.text);
      });

      source.addEventListener("message_stop", function (e) {
        source.close();
        controller.close();
      });
    },
  });
}

async function main() {
  const stream = completions({
    stream: true,
    model: "claude-3-haiku-20240307",
    max_tokens: 1024,
    messages: [
      { role: "user", content: "Tell me about Moddable SDK in short." },
    ],
  });
  for await (const chunk of stream) {
    trace(chunk);
  }
}

main();
