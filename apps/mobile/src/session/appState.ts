import type { LanguageCode, SpeakerGender } from "../config";
import { languageLabel, speakerGenderLabel } from "../config";

export function formatProfileBadge(
  myLang: LanguageCode,
  speakerGender: SpeakerGender,
): string {
  return `${languageLabel(myLang)} · ${speakerGenderLabel(speakerGender)}`;
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
}) {
  return {
    roomCode: input.roomCode,
    speakLang: input.myLang,
    hearLang: input.myLang,
    speakerGender: input.speakerGender,
  };
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
