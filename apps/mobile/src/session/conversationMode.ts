import type { ConversationMode } from "../config";

/** v2 VAD not enabled — hands-free preference still uses push-to-talk in session. */
export function effectiveConversationMode(
  stored: ConversationMode,
): "push_to_talk" {
  void stored;
  return "push_to_talk";
}

export function isHandsFreeComingSoon(stored: ConversationMode): boolean {
  return stored === "hands_free";
}

export function getSessionModeSubtitle(stored: ConversationMode): string {
  if (isHandsFreeComingSoon(stored)) {
    return "Hands-free (coming soon) — hold button to speak for now";
  }
  return "Push-to-talk (hold button to speak)";
}
