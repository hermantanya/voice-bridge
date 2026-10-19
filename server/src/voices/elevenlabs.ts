import { readFile } from "node:fs/promises";
import path from "node:path";

const ELEVENLABS_API_BASE = "https://api.elevenlabs.io/v1";

export type ElevenLabsVoice = {
  voice_id: string;
  name: string;
  category?: string;
};

export type ElevenLabsTtsModel =
  | "eleven_v3"
  | "eleven_multilingual_v2"
  | "eleven_flash_v2_5"
  | "eleven_turbo_v2_5";

export type ElevenLabsVoiceSettings = {
  stability?: number;
  similarity_boost?: number;
  style?: number;
  use_speaker_boost?: boolean;
  speed?: number;
};

function getElevenLabsApiKey(): string {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey || apiKey === "your-elevenlabs-key-here") {
    throw new Error("ELEVENLABS_API_KEY is not configured");
  }
  return apiKey;
}

async function elevenLabsFetch(
  pathname: string,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("xi-api-key", getElevenLabsApiKey());

  return fetch(`${ELEVENLABS_API_BASE}${pathname}`, {
    ...init,
    headers,
  });
}

function sampleMimeType(samplePath: string): string {
  const ext = path.extname(samplePath).slice(1).toLowerCase();
  if (ext === "wav") return "audio/wav";
  if (ext === "webm") return "audio/webm";
  if (ext === "mp3") return "audio/mpeg";
  if (ext === "m4a" || ext === "mp4" || ext === "caf") return "audio/mp4";
  if (ext === "flac") return "audio/flac";
  return "application/octet-stream";
}

export async function listElevenLabsVoices(): Promise<ElevenLabsVoice[]> {
  const response = await elevenLabsFetch("/voices");

  const body = (await response.json()) as {
    voices?: Array<{
      voice_id?: string;
      name?: string;
      category?: string;
    }>;
    detail?: { message?: string };
  };

  if (!response.ok) {
    throw new Error(
      body.detail?.message ??
        `List ElevenLabs voices failed (${response.status})`,
    );
  }

  return (body.voices ?? [])
    .filter(
      (voice): voice is { voice_id: string; name: string; category?: string } =>
        typeof voice.voice_id === "string" && typeof voice.name === "string",
    )
    .map((voice) => ({
      voice_id: voice.voice_id,
      name: voice.name,
      category: voice.category,
    }));
}

export async function createInstantVoiceClone(params: {
  name: string;
  samplePath: string;
  description?: string;
  removeBackgroundNoise?: boolean;
  gender?: "female" | "male";
}): Promise<ElevenLabsVoice> {
  const sample = await readFile(params.samplePath);
  return createInstantVoiceCloneFromBuffer({
    name: params.name,
    sample,
    sampleFilename: path.basename(params.samplePath),
    description: params.description,
    removeBackgroundNoise: params.removeBackgroundNoise,
    gender: params.gender,
  });
}

export async function createInstantVoiceCloneFromBuffer(params: {
  name: string;
  sample: Buffer;
  sampleFilename: string;
  description?: string;
  removeBackgroundNoise?: boolean;
  gender?: "female" | "male";
}): Promise<ElevenLabsVoice> {
  const mimeType = sampleMimeType(params.sampleFilename);

  const form = new FormData();
  form.append("name", params.name);
  if (params.description) {
    form.append("description", params.description);
  }
  form.append(
    "remove_background_noise",
    String(params.removeBackgroundNoise ?? false),
  );
  if (params.gender) {
    form.append("labels", JSON.stringify({ gender: params.gender }));
  }
  form.append(
    "files",
    new Blob([new Uint8Array(params.sample)], { type: mimeType }),
    params.sampleFilename,
  );

  const response = await elevenLabsFetch("/voices/add", {
    method: "POST",
    body: form,
  });

  const body = (await response.json()) as {
    voice_id?: string;
    detail?: { message?: string; status?: string };
  };

  if (!response.ok || !body.voice_id) {
    const message =
      body.detail?.message ??
      (typeof body.detail === "string" ? body.detail : undefined) ??
      `Create ElevenLabs voice clone failed (${response.status})`;
    throw new Error(message);
  }

  return {
    voice_id: body.voice_id,
    name: params.name,
    category: "cloned",
  };
}

export async function deleteElevenLabsVoice(voiceId: string): Promise<void> {
  const response = await elevenLabsFetch(`/voices/${voiceId}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    let message = `Delete ElevenLabs voice failed (${response.status})`;
    try {
      const body = (await response.json()) as {
        detail?: { message?: string };
      };
      if (body.detail?.message) {
        message = body.detail.message;
      }
    } catch {
      // ignore parse errors
    }
    throw new Error(message);
  }
}

/** Per-language model routing — Hebrew is NOT on multilingual_v2 (29 langs). */

/** Lower-latency models for streaming partial TTT (EN/RU). Hebrew stays on v3. */
export function elevenLabsFastModelForLanguage(
  languageCode: "en" | "he" | "ru",
): ElevenLabsTtsModel {
  if (languageCode === "he") {
    return "eleven_v3";
  }
  return "eleven_turbo_v2_5";
}

export function elevenLabsModelForLanguage(
  languageCode: "en" | "he" | "ru",
): ElevenLabsTtsModel {
  if (languageCode === "he") {
    return "eleven_v3";
  }
  return "eleven_multilingual_v2";
}

export function elevenLabsLanguageCodeForTts(
  languageCode: "en" | "he" | "ru",
  modelId: ElevenLabsTtsModel,
): string | undefined {
  // v3 supports language_code; multilingual_v2 rejects it for unsupported langs.
  if (modelId === "eleven_v3") {
    return languageCode;
  }
  return undefined;
}

/** IVC clones: multilingual_v2 for EN/RU; v3 required for Hebrew. */
export const ELEVENLABS_IVC_TTS_DEFAULTS = {
  voiceSettings: {
    stability: 0.5,
    similarity_boost: 0.85,
    style: 0,
    use_speaker_boost: true,
    speed: 0.9,
  },
};

export async function synthesizeElevenLabsSpeech(params: {
  text: string;
  voiceId: string;
  modelId?: ElevenLabsTtsModel;
  languageCode?: string;
  voiceSettings?: ElevenLabsVoiceSettings;
  applyTextNormalization?: "auto" | "on" | "off";
}): Promise<Buffer> {
  const modelId = params.modelId ?? "eleven_multilingual_v2";
  const voiceSettings =
    params.voiceSettings ?? ELEVENLABS_IVC_TTS_DEFAULTS.voiceSettings;

  const response = await elevenLabsFetch(
    `/text-to-speech/${params.voiceId}?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: params.text,
        model_id: modelId,
        voice_settings: voiceSettings,
        apply_text_normalization: params.applyTextNormalization ?? "auto",
        // language_code only for v3; omit for multilingual_v2 (auto-detect).
        ...(params.languageCode && modelId === "eleven_v3"
          ? { language_code: params.languageCode }
          : {}),
      }),
    },
  );

  if (!response.ok) {
    let message = `ElevenLabs TTS failed (${response.status})`;
    try {
      const body = (await response.json()) as {
        detail?: { message?: string };
      };
      if (body.detail?.message) {
        message = body.detail.message;
      }
    } catch {
      // response may not be JSON
    }
    throw new Error(message);
  }

  return Buffer.from(await response.arrayBuffer());
}
