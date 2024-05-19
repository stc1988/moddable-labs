import config from "mc/config";
import EventSource from "eventsource";
import Headers from "headers";
import * as streams from "streams";
for (let key in streams) globalThis[key] = streams[key];

import Timer from "timer";
import Time from "time";

// API specification: https://ai.google.dev/api/rest/v1beta/models/streamGenerateContent

const apiKey = config.api_key;

function completions(apiKey, model, content) {
  return new ReadableStream({
    start(controller) {
      let ticks;
      const source = new EventSource(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`,
        {
          method: "POST",
          headers: new Headers([["Content-Type", "text/event-stream"]]),
          body: JSON.stringify({
            contents: [{ parts: [{ text: content }] }],
          }),
        }
      );
      source.onmessage = function (e) {
        const obj = JSON.parse(e.data, [
          "candidates",
          "content",
          "parts",
          "text",
        ]);
        controller.enqueue(obj.candidates[0].content.parts[0].text);

        ticks = Time.ticks;
      };

      // Close the stream after a certain amount of time has passed since the last message.
      Timer.repeat((id) => {
        if (ticks && Time.ticks - ticks > 3000) {
          Timer.clear(id);
          source.close();
          controller.close();
        }
      }, 500);
    },
  });
}

async function main() {
  const stream = completions(
    config.api_key,
    "gemini-1.5-flash-latest",
    "Tell me about Moddable SDK in short."
  );
  for await (const chunk of stream) {
    trace(chunk || "");
  }
}

main();
