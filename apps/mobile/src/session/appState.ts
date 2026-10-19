import type { LanguageCode, SpeakerGender } from "../config";
import { languageLabel, speakerGenderLabel } from "../config";

export type VoiceProfileStatus = "custom" | "default";

export function hasCustomVoice(
  elevenlabsVoiceId: string | null | undefined,
): boolean {
  return Boolean(elevenlabsVoiceId?.trim());
}

export function resolveVoiceProfileStatus(
  elevenlabsVoiceId: string | null | undefined,
): VoiceProfileStatus {
  return hasCustomVoice(elevenlabsVoiceId) ? "custom" : "default";
}

export function voiceProfileLabel(status: VoiceProfileStatus): string {
  return status === "custom" ? "My voice" : "Preset voice";
}

export function formatProfileBadge(
  myLang: LanguageCode,
  speakerGender: SpeakerGender,
  voiceStatus: VoiceProfileStatus = "default",
): string {
  return `${languageLabel(myLang)} · ${speakerGenderLabel(speakerGender)} · ${voiceProfileLabel(voiceStatus)}`;
}

export function normalizeRoomCode(code: string): string {
  return code.trim().toUpperCase();
}

export function canJoinRoom(code: string): boolean {
  return normalizeRoomCode(code).length >= 4;
}

export function generateRoomCode(random = Math.random): string {
  return random().toString(36).slice(2, 8).toUpperCase();
}

export function buildJoinRoomPayload(input: {
  roomCode: string;
  myLang: LanguageCode;
  speakerGender: SpeakerGender;
  speakLangOverride?: LanguageCode;
  elevenlabsVoiceId?: string | null;
  playTranslatedVoice?: boolean;
  sameRoomTextFirst?: boolean;
  sameRoomMode?: boolean;
  sameRoomPlayFinalVoice?: boolean;
  usingHeadphones?: boolean;
  streamingPtt?: boolean;
}) {
  const payload: {
    roomCode: string;
    hearLang: LanguageCode;
    speakerGender: SpeakerGender;
    speakLangOverride?: LanguageCode;
    elevenlabsVoiceId?: string;
    playTranslatedVoice?: boolean;
    sameRoomTextFirst?: boolean;
    sameRoomMode?: boolean;
    sameRoomPlayFinalVoice?: boolean;
    usingHeadphones?: boolean;
    streamingPtt?: boolean;
  } = {
    roomCode: input.roomCode,
    hearLang: input.myLang,
    speakerGender: input.speakerGender,
  };

  if (input.playTranslatedVoice === false) {
    payload.playTranslatedVoice = false;
  }

  if (input.sameRoomTextFirst === true) {
    payload.sameRoomTextFirst = true;
    payload.sameRoomMode = true;
  } else if (input.sameRoomTextFirst === false) {
    payload.sameRoomTextFirst = false;
    payload.sameRoomMode = false;
  }

  if (input.sameRoomPlayFinalVoice === true) {
    payload.sameRoomPlayFinalVoice = true;
  }

  if (input.usingHeadphones === true) {
    payload.usingHeadphones = true;
  }

  if (input.speakLangOverride) {
    payload.speakLangOverride = input.speakLangOverride;
  }

  if (hasCustomVoice(input.elevenlabsVoiceId)) {
    payload.elevenlabsVoiceId = input.elevenlabsVoiceId!.trim();
  }

  if (input.streamingPtt) {
    payload.streamingPtt = true;
  }

  return payload;
}

export type TurnPhase = "waiting" | "speaking" | "processing";

export type TurnState = {
  turnParticipantId: string | null;
  phase: TurnPhase;
  version: number;
};

export function shouldApplyTurnState(
  current: TurnState,
  incoming: TurnState,
): boolean {
  return incoming.version >= current.version;
}

export function shouldClearPartnerLang(participants: number): boolean {
  return participants < 2;
}
