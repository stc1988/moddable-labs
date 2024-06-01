import config from "mc/config";
import completions from "completions";

const apiKey = config.api_key;

async function main() {
  try {
    const stream = completions({
      apiKey,
      body: {
        stream: true,
        model: "gpt-3.5-turbo",
        messages: [
          { role: "user", content: "Tell me about Moddable SDK in short." },
        ],
      },
    });

    for await (const chunk of stream) {
      trace(chunk);
    }
  } catch (error) {
    trace(`API Error: ${error.status} - ${error.statusText}`);
  }
}

main();
