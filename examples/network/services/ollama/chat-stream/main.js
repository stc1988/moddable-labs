import config from "mc/config";
import completions from "completions";

const host = config.host;

async function main() {
  try {
    const stream = completions({
      host,
      body: {
        model: "llama3",
        stream: true,
        messages: [{ role: "user", content: "why is the sky blue in short?" }],
      },
    });

    for await (const chunk of stream) {
      trace(chunk);
    }
  } catch (error) {
    debugger
    trace(`API Error: ${error.status} - ${error.statusText}`);
  }
}

main();
