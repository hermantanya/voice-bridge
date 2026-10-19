export type TranscriptDirection = "sent" | "received";

export type TranscriptPayload = {
  turnId?: string;
  fromParticipantId: string;
  sourceText: string;
  translatedText: string;
  transcriptLatencyMs?: number;
  latencyMs?: number;
};

export type TranscriptEntry = {
  id: string;
  turnId?: string;
  direction: TranscriptDirection;
  sourceText: string;
  translatedText: string;
  receivedAt: number;
  latencyMs: number;
};

export type PartnerPartial = {
  turnId: string;
  fromParticipantId: string;
  sourceText: string;
  translatedText: string;
};

export function transcriptKey(
  direction: TranscriptDirection,
  turnId: string,
): string {
  return `${direction}:${turnId}`;
}

export function createTranscriptEntry(
  direction: TranscriptDirection,
  payload: TranscriptPayload,
  latencyMs: number,
  receivedAt = Date.now(),
): TranscriptEntry {
  const turnId = payload.turnId;
  return {
    id:
      turnId ??
      `${direction}-${payload.fromParticipantId}-${receivedAt}-${Math.random().toString(36).slice(2, 7)}`,
    turnId,
    direction,
    sourceText: payload.sourceText,
    translatedText: payload.translatedText,
    receivedAt,
    latencyMs,
  };
}

export function appendTranscriptIfNew(
  entries: TranscriptEntry[],
  seenTurnKeys: Set<string>,
  direction: TranscriptDirection,
  payload: TranscriptPayload,
  latencyMs: number,
  receivedAt = Date.now(),
): { entries: TranscriptEntry[]; seenTurnKeys: Set<string> } {
  if (payload.turnId) {
    const key = transcriptKey(direction, payload.turnId);
    if (seenTurnKeys.has(key)) {
      return { entries, seenTurnKeys };
    }
    seenTurnKeys.add(key);
  }

  return {
    entries: [
      ...entries,
      createTranscriptEntry(direction, payload, latencyMs, receivedAt),
    ],
    seenTurnKeys,
  };
}

export function refreshTranscriptLatency(
  entries: TranscriptEntry[],
  direction: TranscriptDirection,
  turnId: string,
  latencyMs: number,
): TranscriptEntry[] {
  return entries.map((entry) =>
    entry.turnId === turnId && entry.direction === direction
      ? { ...entry, latencyMs }
      : entry,
  );
}

export function applyTranslationResultToTranscript(
  entries: TranscriptEntry[],
  seenTurnKeys: Set<string>,
  payload: TranscriptPayload,
): {
  entries: TranscriptEntry[];
  seenTurnKeys: Set<string>;
} {
  const latencyMs = payload.latencyMs ?? payload.transcriptLatencyMs ?? 0;

  if (payload.turnId) {
    const key = transcriptKey("received", payload.turnId);
    if (seenTurnKeys.has(key)) {
      return {
        entries: refreshTranscriptLatency(
          entries,
          "received",
          payload.turnId,
          latencyMs,
        ),
        seenTurnKeys,
      };
    }
  }

  return appendTranscriptIfNew(
    entries,
    seenTurnKeys,
    "received",
    payload,
    latencyMs,
  );
}

export function applyTranslationSentToTranscript(
  entries: TranscriptEntry[],
  seenTurnKeys: Set<string>,
  payload: TranscriptPayload,
): {
  entries: TranscriptEntry[];
  seenTurnKeys: Set<string>;
} {
  const latencyMs = payload.latencyMs ?? payload.transcriptLatencyMs ?? 0;

  if (payload.turnId) {
    const key = transcriptKey("sent", payload.turnId);
    if (seenTurnKeys.has(key)) {
      return {
        entries: refreshTranscriptLatency(
          entries,
          "sent",
          payload.turnId,
          latencyMs,
        ),
        seenTurnKeys,
      };
    }
  }

  return appendTranscriptIfNew(
    entries,
    seenTurnKeys,
    "sent",
    payload,
    latencyMs,
  );
}

export function partnerPartialFromEvent(payload: {
  turnId: string;
  fromParticipantId: string;
  sourceText?: string;
  translatedText?: string;
}): PartnerPartial | null {
  const translatedText = payload.translatedText?.trim() ?? "";
  const sourceText = payload.sourceText?.trim() ?? "";
  if (!translatedText && !sourceText) {
    return null;
  }

  return {
    turnId: payload.turnId,
    fromParticipantId: payload.fromParticipantId,
    sourceText: payload.sourceText ?? "",
    translatedText: payload.translatedText ?? "",
  };
}

/** Persist live partner partial when the floor opens before a final result arrives. */
export function flushPartnerPartialToTranscript(
  entries: TranscriptEntry[],
  seenTurnKeys: Set<string>,
  partial: PartnerPartial | null,
): {
  entries: TranscriptEntry[];
  seenTurnKeys: Set<string>;
} {
  if (!partial) {
    return { entries, seenTurnKeys };
  }

  const hasText =
    partial.translatedText.trim().length > 0 ||
    partial.sourceText.trim().length > 0;
  if (!hasText) {
    return { entries, seenTurnKeys };
  }

  return appendTranscriptIfNew(
    entries,
    seenTurnKeys,
    "received",
    {
      turnId: partial.turnId,
      fromParticipantId: partial.fromParticipantId,
      sourceText: partial.sourceText,
      translatedText: partial.translatedText,
    },
    0,
  );
}
