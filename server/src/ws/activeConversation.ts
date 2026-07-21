export type ActiveInterval = { startMs: number; endMs: number };

export function mergeIntervals(intervals: ActiveInterval[]): ActiveInterval[] {
  if (intervals.length === 0) {
    return [];
  }

  const sorted = [...intervals].sort((a, b) => a.startMs - b.startMs);
  const merged: ActiveInterval[] = [{ ...sorted[0] }];

  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i];
    const last = merged[merged.length - 1];

    if (current.startMs <= last.endMs) {
      last.endMs = Math.max(last.endMs, current.endMs);
    } else {
      merged.push({ ...current });
    }
  }

  return merged;
}

export function mergedDurationMs(intervals: ActiveInterval[]): number {
  return mergeIntervals(intervals).reduce(
    (sum, interval) => sum + (interval.endMs - interval.startMs),
    0,
  );
}

export type ActiveConversationTracker = {
  completedIntervals: ActiveInterval[];
  pipelineStartedAt: Map<string, number>;
};

export function createActiveConversationTracker(): ActiveConversationTracker {
  return {
    completedIntervals: [],
    pipelineStartedAt: new Map(),
  };
}

const MAX_TURN_INTERVAL_MS = 60 * 60 * 1000;

export function resolvePipelineStartMs(
  recordingStartedAt: number | undefined,
  speechMs: number,
  nowMs: number = Date.now(),
): number {
  const fallbackStartMs = nowMs - speechMs;

  if (
    typeof recordingStartedAt !== "number" ||
    !Number.isFinite(recordingStartedAt) ||
    recordingStartedAt <= 0 ||
    recordingStartedAt > nowMs
  ) {
    return fallbackStartMs;
  }

  if (nowMs - recordingStartedAt > MAX_TURN_INTERVAL_MS) {
    return fallbackStartMs;
  }

  return recordingStartedAt;
}

export function startActivePipeline(
  tracker: ActiveConversationTracker,
  participantId: string,
  startedAtMs: number,
): void {
  tracker.pipelineStartedAt.set(participantId, startedAtMs);
}

export function closeActivePipeline(
  tracker: ActiveConversationTracker,
  participantId: string,
  endMs: number = Date.now(),
): void {
  const startedAt = tracker.pipelineStartedAt.get(participantId);
  if (startedAt === undefined) {
    return;
  }

  tracker.completedIntervals.push({ startMs: startedAt, endMs });
  tracker.pipelineStartedAt.delete(participantId);
}

export function getActiveConversationMs(
  tracker: ActiveConversationTracker,
  nowMs: number = Date.now(),
): number {
  const openIntervals: ActiveInterval[] = [
    ...tracker.pipelineStartedAt.values(),
  ].map((startMs) => ({ startMs, endMs: nowMs }));

  return mergedDurationMs([...tracker.completedIntervals, ...openIntervals]);
}
