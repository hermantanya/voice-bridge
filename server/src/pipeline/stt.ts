import { File } from "node:buffer";

import { getOpenAIClient } from "./openai.js";

const MIME_BY_FORMAT: Record<string, string> = {
  webm: "audio/webm",
  wav: "audio/wav",
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  mp4: "audio/mp4",
  caf: "audio/x-caf",
};

export async function transcribe(
  audio: Buffer,
  format = "webm",
): Promise<{ text: string; language: string }> {
  const openai = getOpenAIClient();
  const mimeType = MIME_BY_FORMAT[format] ?? "audio/webm";
  const file = new File([audio], `audio.${format}`, { type: mimeType });

  const response = await openai.audio.transcriptions.create({
    file,
    model: "whisper-1",
    response_format: "verbose_json",
  });

  const text = response.text.trim();
  const language = response.language ?? "en";

  return { text, language };
}
