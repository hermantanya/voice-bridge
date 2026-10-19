import { Platform } from "react-native";

/** Build-time flag: EXPO_PUBLIC_STREAMING_PTT=1 */
export function isStreamingPttEnvEnabled(): boolean {
  return process.env.EXPO_PUBLIC_STREAMING_PTT === "1";
}

/** Build-time flag: EXPO_PUBLIC_STREAMING_PTT_DEBUG=1 */
export function isStreamingPttDebugEnabled(): boolean {
  return process.env.EXPO_PUBLIC_STREAMING_PTT_DEBUG === "1";
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

export function isStreamingPttUplinkAvailable(
  devToggleEnabled: boolean,
): boolean {
  if (Platform.OS !== "web") {
    return false;
  }
  return isStreamingPttEnvEnabled() || devToggleEnabled;
}
