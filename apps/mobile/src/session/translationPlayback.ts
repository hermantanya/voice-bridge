export type TranslationPlaybackEvent =
  | {
      kind: "translation_result";
      fromParticipantId: string;
      turnId?: string;
      audioBase64?: string;
      skippedTts?: boolean;
    }
  | {
      kind: "translation_sent";
      fromParticipantId: string;
      turnId?: string;
      audioBase64?: string;
      skippedTts?: boolean;
    }
  | {
      kind: "partial_translation_audio";
      fromParticipantId?: string;
      turnId?: string;
      role?: "speaker" | string;
      audioBase64?: string;
    };

/** Listener-only: never play TTS for the speaker's own turn or translation_sent echoes. */
export function shouldPlayTranslationAudio(
  myParticipantId: string | null,
  event: TranslationPlaybackEvent,
): boolean {
  if (event.kind === "translation_sent") {
    return false;
  }

  if ("skippedTts" in event && event.skippedTts) {
    return false;
  }

  if (!event.audioBase64?.trim()) {
    return false;
  }

  if (!myParticipantId) {
    return false;
  }

  if (
    event.fromParticipantId &&
    event.fromParticipantId === myParticipantId
  ) {
    return false;
  }

  if (
    event.kind === "partial_translation_audio" &&
    event.role === "speaker"
  ) {
    return false;
  }

  return true;
}

export function isLiveTranscriptionUnavailableMessage(message: string): boolean {
  return message.includes("Live transcription unavailable");
}

export function isLocalStreamingSpeakerTurn(
  myParticipantId: string | null,
  turnParticipantId: string | null,
  turnPhase: "waiting" | "speaking" | "processing",
): boolean {
  if (!myParticipantId) {
    return false;
  }
  return turnParticipantId === myParticipantId && turnPhase === "speaking";
}
