import type { ConversationMode } from "../config";

import { isHandsFreeComingSoon } from "./conversationMode";

export type ConnectionStatus = "connecting" | "connected" | "disconnected" | "error";
export type TurnPhase = "waiting" | "speaking" | "processing";

/** Phase 1: unmuted = allowed to use hold-to-talk (not hands-free yet). */
export function getSelfMicLabel(isSelfMuted: boolean): string {
  return isSelfMuted ? "Mic off" : "Mic on";
}

export function getSelfMicHint(
  isSelfMuted: boolean,
  conversationMode: ConversationMode = "push_to_talk",
): string {
  if (isSelfMuted) {
    return "Muted — tap Unmute, then hold to talk.";
  }
  if (isHandsFreeComingSoon(conversationMode)) {
    return "Hands-free is coming soon — hold the button while you speak.";
  }
  return "Push-to-talk — hold the button while you speak.";
}

export function isPartnerTurnActive(input: {
  turnParticipantId: string | null;
  participantId: string | null;
  turnPhase: TurnPhase;
}): boolean {
  return (
    input.turnParticipantId !== null &&
    input.participantId !== null &&
    input.turnParticipantId !== input.participantId &&
    (input.turnPhase === "speaking" || input.turnPhase === "processing")
  );
}

export type PartnerLiveLine = {
  kind: "text" | "placeholder";
  text: string;
};

export function getPartnerLiveSourceLine(input: {
  partnerPartial?: { sourceText?: string } | null;
  partnerTurnActive: boolean;
  turnPhase: TurnPhase;
}): PartnerLiveLine | null {
  const source = input.partnerPartial?.sourceText?.trim() ?? "";
  if (source) {
    return { kind: "text", text: source };
  }
  if (input.partnerTurnActive && input.turnPhase === "speaking") {
    return { kind: "placeholder", text: "Listening…" };
  }
  return null;
}

export function getPartnerLiveTranslationLine(input: {
  partnerPartial?: { sourceText?: string; translatedText?: string } | null;
  partnerTurnActive: boolean;
  turnPhase: TurnPhase;
}): PartnerLiveLine | null {
  const translated = input.partnerPartial?.translatedText?.trim() ?? "";
  if (translated) {
    return { kind: "text", text: translated };
  }

  const source = input.partnerPartial?.sourceText?.trim() ?? "";
  const partnerProcessing =
    input.partnerTurnActive && input.turnPhase === "processing";
  if (source || partnerProcessing) {
    return { kind: "placeholder", text: "Translating…" };
  }
  return null;
}

export function shouldShowPartnerLiveCard(input: {
  partnerTurnActive: boolean;
  partnerPartial?: { sourceText?: string; translatedText?: string } | null;
}): boolean {
  if (input.partnerTurnActive) {
    return true;
  }

  const source = input.partnerPartial?.sourceText?.trim() ?? "";
  const translated = input.partnerPartial?.translatedText?.trim() ?? "";
  return source.length > 0 || translated.length > 0;
}

export function getTurnLabel(input: {
  participants: number;
  isProcessing: boolean;
  isMyTurn: boolean;
  isOpenTurn: boolean;
  isSelfMuted?: boolean;
}): string {
  if (input.participants < 2) {
    return "Waiting for partner";
  }
  if (input.isSelfMuted) {
    return "Mic off";
  }
  if (input.isProcessing) {
    return "Translating...";
  }
  if (input.isMyTurn) {
    return "You're speaking";
  }
  if (input.isOpenTurn) {
    return "Ready: hold to talk";
  }
  return "Partner is speaking";
}

export function canStartTalking(input: {
  status: ConnectionStatus;
  participants: number;
  isProcessing: boolean;
  isRecording: boolean;
  isOpenTurn: boolean;
  isMyTurn: boolean;
  isSelfMuted?: boolean;
}): boolean {
  return (
    input.status === "connected" &&
    input.participants > 1 &&
    !input.isSelfMuted &&
    !input.isProcessing &&
    !input.isRecording &&
    (input.isOpenTurn || input.isMyTurn)
  );
}

export function shouldShowTapToStop(isRecording: boolean): boolean {
  return isRecording;
}
