import config from "mc/config";
import completions from "completions";

const baseURL = config.base_url;

async function main() {
  try {
    const stream = completions({
      baseURL,
      body: {
        model: "llama3.2",
        stream: true,
        messages: [{ role: "user", content: "why is the sky blue in short?" }],
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
