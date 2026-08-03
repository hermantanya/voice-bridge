import type { LanguageCode, SpeakerGender } from "../config";
import { SERVER_URL } from "../config";
import { readApiJson } from "./readApiJson";

export type VoiceEnrollmentResult = {
  voiceId: string;
  previewText: string;
  previewAudioBase64: string;
  previewAudioFormat: string;
};

export async function enrollVoice(params: {
  audioBase64: string;
  format: string;
  language: LanguageCode;
  gender: SpeakerGender;
  durationMs: number;
  replaceVoiceId?: string | null;
}): Promise<VoiceEnrollmentResult> {
  let response: Response;

  try {
    response = await fetch(`${SERVER_URL}/api/voices/enroll`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        audioBase64: params.audioBase64,
        format: params.format,
        language: params.language,
        gender: params.gender,
        durationMs: params.durationMs,
        replaceVoiceId: params.replaceVoiceId ?? undefined,
      }),
    });
  } catch (error) {
    throw new Error(
      error instanceof Error
        ? `Could not reach server at ${SERVER_URL}: ${error.message}`
        : "Could not reach server",
    );
  }

  const body = await readApiJson<
    VoiceEnrollmentResult & { error?: string }
  >(response);

  if (!response.ok) {
    throw new Error(body.error ?? `Voice enrollment failed (${response.status})`);
  }

  if (!body.voiceId) {
    throw new Error("Voice enrollment did not return a voiceId");
  }

  return body;
}

export async function deleteEnrolledVoice(voiceId: string): Promise<void> {
  let response: Response;

  try {
    response = await fetch(
      `${SERVER_URL}/api/voices/${encodeURIComponent(voiceId)}`,
      {
        method: "DELETE",
        headers: {
          Accept: "application/json",
        },
      },
    );
  } catch (error) {
    throw new Error(
      error instanceof Error
        ? `Could not reach server at ${SERVER_URL}: ${error.message}`
        : "Could not reach server",
    );
  }

  if (!response.ok) {
    const body = await readApiJson<{ error?: string }>(response);
    throw new Error(body.error ?? "Could not delete enrolled voice");
  }
}
