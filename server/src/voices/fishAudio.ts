import { readFile } from "node:fs/promises";
import path from "node:path";

const FISH_API_BASE = "https://api.fish.audio";

export type FishVoiceModel = {
  id: string;
  title: string;
  state?: string;
  visibility?: string;
};

export type FishTtsModel = "s2.1-pro-free" | "s2.1-pro" | "s2-pro";

function getFishApiKey(): string {
  const apiKey = process.env.FISH_API_KEY;
  if (!apiKey || apiKey === "your-fish-api-key-here") {
    throw new Error("FISH_API_KEY is not configured");
  }
  return apiKey;
}

async function fishFetch(
  pathname: string,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${getFishApiKey()}`);

  return fetch(`${FISH_API_BASE}${pathname}`, {
    ...init,
    headers,
  });
}

function readVoiceId(record: Record<string, unknown>): string {
  const id = record._id ?? record.id;
  if (typeof id !== "string" || !id) {
    throw new Error("Fish API response missing voice id");
  }
  return id;
}

export async function listMyFishVoices(): Promise<FishVoiceModel[]> {
  const response = await fishFetch("/model?self=true&page_size=20");

  const body = (await response.json()) as {
    total?: number;
    items?: Array<Record<string, unknown>>;
    error?: { message?: string };
  };

  if (!response.ok) {
    throw new Error(
      body.error?.message ?? `List Fish voices failed (${response.status})`,
    );
  }

  return (body.items ?? []).map((item) => ({
    id: readVoiceId(item),
    title: typeof item.title === "string" ? item.title : "untitled",
    state: typeof item.state === "string" ? item.state : undefined,
    visibility:
      typeof item.visibility === "string" ? item.visibility : undefined,
  }));
}

export async function createPrivateFishVoice(params: {
  title: string;
  samplePath: string;
  description?: string;
}): Promise<FishVoiceModel> {
  const sample = await readFile(params.samplePath);
  const ext = path.extname(params.samplePath).slice(1).toLowerCase() || "wav";
  const mimeType =
    ext === "wav"
      ? "audio/wav"
      : ext === "webm"
        ? "audio/webm"
        : ext === "mp3"
          ? "audio/mpeg"
          : ext === "m4a" || ext === "mp4"
            ? "audio/mp4"
            : "application/octet-stream";

  const form = new FormData();
  form.append("type", "tts");
  form.append("title", params.title);
  form.append("visibility", "private");
  form.append("train_mode", "fast");
  form.append("enhance_audio_quality", "true");
  if (params.description) {
    form.append("description", params.description);
  }
  form.append(
    "voices",
    new Blob([sample], { type: mimeType }),
    path.basename(params.samplePath),
  );

  const response = await fishFetch("/model", {
    method: "POST",
    body: form,
  });

  const body = (await response.json()) as Record<string, unknown> & {
    error?: { message?: string };
  };

  if (!response.ok) {
    throw new Error(
      (body.error?.message as string | undefined) ??
        `Create Fish voice failed (${response.status})`,
    );
  }

  return {
    id: readVoiceId(body),
    title: typeof body.title === "string" ? body.title : params.title,
    state: typeof body.state === "string" ? body.state : undefined,
    visibility:
      typeof body.visibility === "string" ? body.visibility : "private",
  };
}

export async function synthesizeFishSpeech(params: {
  text: string;
  referenceId: string;
  model?: FishTtsModel;
}): Promise<Buffer> {
  const model = params.model ?? "s2.1-pro-free";

  const response = await fishFetch("/v1/tts", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      model,
    },
    body: JSON.stringify({
      text: params.text,
      reference_id: params.referenceId,
      format: "mp3",
    }),
  });

  if (!response.ok) {
    let message = `Fish TTS failed (${response.status})`;
    try {
      const body = (await response.json()) as { error?: { message?: string } };
      if (body.error?.message) {
        message = body.error.message;
      }
    } catch {
      // response may not be JSON
    }
    throw new Error(message);
  }

  return Buffer.from(await response.arrayBuffer());
}
