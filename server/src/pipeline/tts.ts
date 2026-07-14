import { getOpenAIClient } from "./openai.js";

export async function synthesize(text: string): Promise<Buffer> {
  const openai = getOpenAIClient();

  const response = await openai.audio.speech.create({
    model: "tts-1",
    voice: "nova",
    input: text,
  });

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
