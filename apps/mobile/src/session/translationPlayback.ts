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
export type TranslationPlaybackPrefs = {
  playTranslatedVoice: boolean;
  /** When true (and not using headphones), suppress live partial TTS while partner holds PTT. */
  sameRoomTextFirst: boolean;
  /** When same-room text-first is on, play final TTS after partner releases. */
  sameRoomPlayFinalVoice: boolean;
  /** When same-room is on, partial/final TTS may play in headphones without disturbing the room. */
  usingHeadphones: boolean;
};

export function isRateLimitErrorMessage(message: string): boolean {
  return /rate limit exceeded/i.test(message);
}

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

/** Listener playback policy: honors transcript-only and same-room (in-person) settings. */
export function shouldAutoPlayTranslationAudio(
  myParticipantId: string | null,
  prefs: TranslationPlaybackPrefs,
  event: TranslationPlaybackEvent,
  options?: { partnerHoldActive?: boolean },
): boolean {
  if (!prefs.playTranslatedVoice) {
    return false;
  }

  if (!shouldPlayTranslationAudio(myParticipantId, event)) {
    return false;
  }

  const inPersonSameRoom =
    prefs.sameRoomTextFirst && !prefs.usingHeadphones;

  if (inPersonSameRoom) {
    if (event.kind === "partial_translation_audio") {
      return false;
    }
    if (event.kind === "translation_result") {
      if (!prefs.sameRoomPlayFinalVoice) {
        return false;
      }
      if (options?.partnerHoldActive) {
        return false;
      }
    }
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
