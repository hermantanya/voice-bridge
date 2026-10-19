import { Platform } from "react-native";

/** Build-time flag: EXPO_PUBLIC_STREAMING_PTT=1 */
export function isStreamingPttEnvEnabled(): boolean {
  return process.env.EXPO_PUBLIC_STREAMING_PTT === "1";
}

export function isStreamingPttUplinkAvailable(
  devToggleEnabled: boolean,
): boolean {
  if (Platform.OS !== "web") {
    return false;
  }
  return isStreamingPttEnvEnabled() || devToggleEnabled;
}
