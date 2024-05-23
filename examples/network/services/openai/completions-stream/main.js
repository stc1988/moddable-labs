import config from "mc/config";
import EventSource from "eventsource";
import Headers from "headers";
import * as streams from "streams";
for (let key in streams) globalThis[key] = streams[key];

// API specification: https://platform.openai.com/docs/guides/text-generation/chat-completions-api

const apiKey = config.api_key;

function completions(body) {
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
          body: JSON.stringify(body),
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
    },
  });
}

async function main() {
  const stream = completions({
    stream: true,
    model: "gpt-3.5-turbo",
    messages: [
      { role: "user", content: "Tell me about Moddable SDK in short." },
    ],
  });
  for await (const chunk of stream) {
    trace(chunk);
  }
}

main();
