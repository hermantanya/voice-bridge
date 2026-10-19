/** Server-side gate for Streaming PTT spike (batch PTT unchanged when off). */
export function isServerStreamingPttEnabled(): boolean {
  const raw = process.env.STREAMING_PTT_ENABLED?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

export function isStreamingPttAllowedForClient(
  clientRequestedStreaming?: boolean,
): boolean {
  return isServerStreamingPttEnabled() && clientRequestedStreaming === true;
}
