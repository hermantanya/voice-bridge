import type { ConversationMode } from "../config";

import { isHandsFreeMode } from "./conversationMode";

export type ConnectionStatus = "connecting" | "connected" | "disconnected" | "error";
export type TurnPhase = "waiting" | "speaking" | "processing";

export function getSelfMicLabel(isSelfMuted: boolean): string {
  return isSelfMuted ? "Muted" : "Live";
}

export function getSelfMicHint(
  isSelfMuted: boolean,
  conversationMode: ConversationMode = "push_to_talk",
): string {
  if (isSelfMuted) {
    if (isHandsFreeMode(conversationMode)) {
      return "Muted — tap Unmute to listen again.";
    }
    return "Muted — tap Unmute, then hold to talk.";
  }
  if (isHandsFreeMode(conversationMode)) {
    return "Hands-free — speak naturally; we detect when you pause.";
  }
  return "Push-to-talk — hold the button while you speak.";
}

export function getTurnLabel(input: {
  participants: number;
  isProcessing: boolean;
  isMyTurn: boolean;
  isOpenTurn: boolean;
  isSelfMuted?: boolean;
  conversationMode?: ConversationMode;
  handsFreeCapturing?: boolean;
  handsFreeListening?: boolean;
}): string {
  if (input.participants < 2) {
    return "Waiting for partner";
  }
  if (input.isSelfMuted) {
    return "Mic off";
  }
  if (isHandsFreeMode(input.conversationMode ?? "push_to_talk")) {
    if (input.handsFreeCapturing) {
      return "You're speaking";
    }
    if (input.handsFreeListening) {
      return "Listening…";
    }
    return "Starting mic…";
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
  conversationMode?: ConversationMode;
}): boolean {
  if (isHandsFreeMode(input.conversationMode ?? "push_to_talk")) {
    return false;
  }
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
