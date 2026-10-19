export type NativeRecordingRef = {
  uri: string | null;
  getStatus: () => { url: string | null; durationMillis?: number };
};

/** expo-audio exposes `uri` / `getStatus().url` (no getURI on SDK 57). */
export function getNativeRecordingUri(
  recording: NativeRecordingRef,
): string | null {
  const status = recording.getStatus();
  return recording.uri ?? status.url ?? null;
}

export function nativeRecordingDurationMs(
  recording: NativeRecordingRef,
  wallClockMs: number,
): number {
  const statusMs = recording.getStatus().durationMillis ?? 0;
  return Math.max(0, Math.round(Math.max(statusMs, wallClockMs)));
}
