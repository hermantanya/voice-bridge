import { File } from "node:buffer";

import { getOpenAIClient } from "./openai.js";

const MIME_BY_FORMAT: Record<string, string> = {
  webm: "audio/webm",
  wav: "audio/wav",
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  mp4: "audio/mp4",
};

export async function transcribe(
  audio: Buffer,
  sourceLang: string,
  format = "webm",
): Promise<string> {
  const openai = getOpenAIClient();
  const mimeType = MIME_BY_FORMAT[format] ?? "audio/webm";
  const file = new File([audio], `audio.${format}`, { type: mimeType });

  const response = await openai.audio.transcriptions.create({
    file,
    model: "whisper-1",
    language: sourceLang,
  });

  return response.text.trim();
}
