import { fetch, Headers } from "fetch";
import UUID from "uuid";

// API specification: https://platform.openai.com/docs/api-reference/audio/createTranscription

async function transcription(options) {
  const { apiKey, audio } = options;
  const model = options.model ?? "whisper-1";
  const language = options.language ?? "ja";

  const boundary =
    "--------------------------" +
    `${UUID().replaceAll("-", "").substring(0, 22)}`;
  const header =
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="model"\r\n\r\n${model}\r\n` +
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="language"\r\n\r\n${language}\r\n` +
    `--${boundary}\r\n` +
    'Content-Disposition: form-data; name="file"; filename="speak.wav"\r\n' +
    "Content-Type: application/octet-stream\r\n\r\n";
  const footer = `\r\n--${boundary}--\r\n`;

  const bodyView = new Uint8Array(new ArrayBuffer(header.length+audio.byteLength+ footer.length));
  let offset = 0;
  bodyView.set(new Uint8Array(ArrayBuffer.fromString(header)), offset);
  offset += header.length
  bodyView.set(new Uint8Array(audio), offset);
  offset += audio.byteLength;
  bodyView.set(new Uint8Array( ArrayBuffer.fromString(footer)), offset);

  const response = await fetch("https://api.openai.com/v1/audio/transcriptions",
  {
    method: "POST",
    headers: new Headers([
      ["Content-Type", `multipart/form-data; boundary=${boundary}`],
      ["Authorization", `Bearer ${apiKey}`]
    ]),
    body: bodyView.buffer,
  });

  if (response.status === 200) {
    const obj = await response.json();
    return obj.text;
  }
  const obj = await response.json();
  debugger
  throw new APIError(response.status, response.statusText, obj);
}

class APIError extends Error {
  constructor(status, statusText, obj) {
    super(`OpenAI API Error: ${status} ${statusText}`);
    this.status = status;
    this.statusText = statusText;
    this.detail = obj.error;
  }
}

export default transcription;
