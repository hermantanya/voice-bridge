export type HoldToTalkStartResult =
  | "denied"
  | "cancelled_before_record"
  | "stopped_after_record"
  | "recording";

export type HoldToTalkDeps = {
  stillHolding: () => boolean;
  claimTurn: () => Promise<boolean>;
  releaseTurn: () => Promise<void>;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<boolean>;
};

/**
 * Hold-to-talk start flow. Must stay in sync with App.handleStartRecording.
 */
export async function runHoldToTalkStart(
  deps: HoldToTalkDeps,
): Promise<HoldToTalkStartResult> {
  const claimed = await deps.claimTurn();
  if (!claimed) {
    return "denied";
  }

  if (!deps.stillHolding()) {
    await deps.releaseTurn();
    return "cancelled_before_record";
  }

  try {
    await deps.startRecording();
  } catch (error) {
    await deps.releaseTurn();
    throw error;
  }

  if (!deps.stillHolding()) {
    const delivered = await deps.stopRecording();
    if (!delivered) {
      await deps.releaseTurn();
    }
    return "stopped_after_record";
  }

  return "recording";
}


export function shouldReleaseTurnAfterLocalStop(input: {
  hadSpeakingTurn: boolean;
  deliveredAudio: boolean;
}): boolean {
  return input.hadSpeakingTurn && !input.deliveredAudio;
}

export function shouldForceStopRecording(input: {
  inSession: boolean;
  isMyTurn: boolean;
  isOpenTurn: boolean;
  isRecording: boolean;
}): boolean {
  return (
    input.inSession &&
    !input.isMyTurn &&
    !input.isOpenTurn &&
    input.isRecording
  );
}

export function shouldReleaseHoldTimestamp(
  result: HoldToTalkStartResult,
): boolean {
  return result === "denied" || result === "cancelled_before_record";
}
