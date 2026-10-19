/**
 * Throttle partial GPT translations during a streaming hold.
 * Returns true when a new translate should run.
 */
export function shouldTranslatePartial(input: {
  sourceText: string;
  lastTranslatedSource: string;
  lastTranslateAtMs: number;
  nowMs: number;
  minIntervalMs?: number;
  minCharDelta?: number;
}): boolean {
  const minIntervalMs = input.minIntervalMs ?? 450;
  const minCharDelta = input.minCharDelta ?? 8;
  const trimmed = input.sourceText.trim();
  if (trimmed.length < 3) {
    return false;
  }
  if (input.nowMs - input.lastTranslateAtMs < minIntervalMs) {
    return false;
  }
  if (
    trimmed.length - input.lastTranslatedSource.trim().length <
    minCharDelta
  ) {
    return false;
  }
  return trimmed !== input.lastTranslatedSource.trim();
}
