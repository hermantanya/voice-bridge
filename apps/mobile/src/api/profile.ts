import type { LanguageCode, SpeakerGender } from "../config";
import { SERVER_URL } from "../config";
import { readApiJson } from "./readApiJson";

export type ServerUserProfile = {
  hearLang: LanguageCode;
  speakerGender: SpeakerGender;
  elevenlabsVoiceId: string | null;
};

export type ServerProfileResponse = {
  id: string;
  email: string;
  profile: ServerUserProfile;
};

export async function fetchProfile(
  token: string,
): Promise<ServerProfileResponse> {
  let response: Response;

  try {
    response = await fetch(`${SERVER_URL}/api/profile`, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
    });
  } catch (error) {
    throw new Error(
      error instanceof Error
        ? `Could not reach server at ${SERVER_URL}: ${error.message}`
        : "Could not reach server",
    );
  }

  const body = await readApiJson<ServerProfileResponse & { error?: string }>(
    response,
  );

  if (!response.ok) {
    throw new Error(body.error ?? `Could not load profile (${response.status})`);
  }

  return body;
}

export async function patchProfile(
  token: string,
  patch: Partial<
    Pick<
      ServerUserProfile,
      "hearLang" | "speakerGender" | "elevenlabsVoiceId"
    >
  >,
): Promise<ServerProfileResponse> {
  let response: Response;

  try {
    response = await fetch(`${SERVER_URL}/api/profile`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(patch),
    });
  } catch (error) {
    throw new Error(
      error instanceof Error
        ? `Could not reach server at ${SERVER_URL}: ${error.message}`
        : "Could not reach server",
    );
  }

  const body = await readApiJson<ServerProfileResponse & { error?: string }>(
    response,
  );

  if (!response.ok) {
    throw new Error(
      body.error ?? `Could not update profile (${response.status})`,
    );
  }

  return body;
}
