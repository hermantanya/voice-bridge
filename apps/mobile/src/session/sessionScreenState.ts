export type ConnectionStatus = "connecting" | "connected" | "disconnected" | "error";
export type TurnPhase = "waiting" | "speaking" | "processing";

export function getTurnLabel(input: {
  participants: number;
  isProcessing: boolean;
  isMyTurn: boolean;
  isOpenTurn: boolean;
}): string {
  if (input.participants < 2) {
    return "Waiting for partner";
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
}): boolean {
  return (
    input.status === "connected" &&
    input.participants > 1 &&
    !input.isProcessing &&
    !input.isRecording &&
    (input.isOpenTurn || input.isMyTurn)
  );
}

export function shouldShowTapToStop(isRecording: boolean): boolean {
  return isRecording;
}
