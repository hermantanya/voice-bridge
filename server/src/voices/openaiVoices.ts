import { readFile } from "node:fs/promises";
import path from "node:path";

import { getOpenAIClient } from "../pipeline/openai.js";
import type {
  CustomVoiceRef,
  ListedCustomVoice,
  SpeechVoice,
  VoiceConsentLanguage,
} from "./types.js";
import { isCustomVoice } from "./types.js";

const OPENAI_BASE = "https://api.openai.com/v1";

function getApiKey(): string {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || apiKey === "sk-your-key-here") {
    throw new Error("OPENAI_API_KEY is not configured");
  }
  return apiKey;
}

async function openaiFetch(
  pathname: string,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${getApiKey()}`);

  return fetch(`${OPENAI_BASE}${pathname}`, {
    ...init,
    headers,
  });
}

export async function listCustomVoices(): Promise<ListedCustomVoice[]> {
  const response = await openaiFetch("/audio/voices");

  if (response.status === 404) {
    throw new Error(
      "Custom voices endpoint not found (404). Your SDK/API version may not expose this yet.",
    );
  }

  const body = (await response.json()) as {
    data?: ListedCustomVoice[];
    error?: { message?: string; type?: string; code?: string };
  };

  if (!response.ok) {
    const message =
      body.error?.message ?? `List voices failed (${response.status})`;
    throw new Error(message);
  }

  return body.data ?? [];
}

export async function uploadVoiceConsent(params: {
  name: string;
  language: VoiceConsentLanguage;
  recordingPath: string;
}): Promise<string> {
  const recording = await readFile(params.recordingPath);
  const ext = path.extname(params.recordingPath).slice(1) || "wav";
  const mimeType =
    ext === "wav"
      ? "audio/wav"
      : ext === "webm"
        ? "audio/webm"
        : ext === "mp4" || ext === "m4a"
          ? "audio/mp4"
          : "application/octet-stream";

  const form = new FormData();
  form.append("name", params.name);
  form.append("language", params.language);
  form.append(
    "recording",
    new Blob([recording], { type: mimeType }),
    path.basename(params.recordingPath),
  );

  const response = await openaiFetch("/audio/voice_consents", {
    method: "POST",
    body: form,
  });

  const body = (await response.json()) as {
    id?: string;
    error?: { message?: string };
  };

  if (!response.ok || !body.id) {
    throw new Error(
      body.error?.message ?? `Voice consent upload failed (${response.status})`,
    );
  }

  return body.id;
}

export async function createCustomVoice(params: {
  name: string;
  consentId: string;
  samplePath: string;
}): Promise<CustomVoiceRef> {
  const sample = await readFile(params.samplePath);
  const ext = path.extname(params.samplePath).slice(1) || "wav";
  const mimeType =
    ext === "wav"
      ? "audio/wav"
      : ext === "webm"
        ? "audio/webm"
        : ext === "mp4" || ext === "m4a"
          ? "audio/mp4"
          : "application/octet-stream";

  const form = new FormData();
  form.append("name", params.name);
  form.append("consent", params.consentId);
  form.append(
    "audio_sample",
    new Blob([sample], { type: mimeType }),
    path.basename(params.samplePath),
  );

  const response = await openaiFetch("/audio/voices", {
    method: "POST",
    body: form,
  });

  const body = (await response.json()) as {
    id?: string;
    error?: { message?: string };
  };

  if (!response.ok || !body.id) {
    throw new Error(
      body.error?.message ?? `Custom voice creation failed (${response.status})`,
    );
  }

  return { id: body.id };
}

export async function synthesizeSpeech(
  text: string,
  voice: SpeechVoice,
  language?: string,
): Promise<Buffer> {
  const openai = getOpenAIClient();

  if (isCustomVoice(voice)) {
    const response = await openaiFetch("/audio/speech", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-mini-tts",
        voice: { id: voice.id },
        input: text,
        ...(language ? { language } : {}),
        format: "mp3",
      }),
    });

    if (!response.ok) {
      const body = (await response.json()) as { error?: { message?: string } };
      throw new Error(
        body.error?.message ??
          `Custom voice speech failed (${response.status})`,
      );
    }

    return Buffer.from(await response.arrayBuffer());
  }

  const response = await openai.audio.speech.create({
    model: "tts-1",
    voice,
    input: text,
  });

  return Buffer.from(await response.arrayBuffer());
}
