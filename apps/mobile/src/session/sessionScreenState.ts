export type ConnectionStatus = "connecting" | "connected" | "disconnected" | "error";
export type TurnPhase = "waiting" | "speaking" | "processing";

/** Phase 1: unmuted = allowed to use hold-to-talk (not hands-free yet). */
export function getSelfMicLabel(isSelfMuted: boolean): string {
  return isSelfMuted ? "Mic off" : "Mic on";
}

export function getSelfMicHint(isSelfMuted: boolean): string {
  return isSelfMuted
    ? "Muted — tap Unmute, then hold to talk."
    : "Push-to-talk — hold the button while you speak. Hands-free comes later.";
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
