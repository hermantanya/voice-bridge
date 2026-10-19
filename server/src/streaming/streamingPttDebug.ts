export function isStreamingPttDebugEnabled(): boolean {
  return process.env.STREAMING_PTT_DEBUG?.trim() === "1";
}

export function streamingPttDebugLog(
  message: string,
  details?: Record<string, unknown>,
): void {
  if (!isStreamingPttDebugEnabled()) {
    return;
  }
  if (details) {
    console.log(`[streaming-ptt] ${message}`, details);
    return;
  }
  console.log(`[streaming-ptt] ${message}`);
}
