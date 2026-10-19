import type { ConversationMode } from "../config";

export function effectiveConversationMode(
  stored: ConversationMode,
): ConversationMode {
  return stored;
}

export function isHandsFreeMode(stored: ConversationMode): boolean {
  return stored === "hands_free";
}

/** @deprecated use isHandsFreeMode */
export function isHandsFreeComingSoon(stored: ConversationMode): boolean {
  return false;
}

export function getSessionModeSubtitle(stored: ConversationMode): string {
  if (isHandsFreeMode(stored)) {
    return "Hands-free — speak naturally when mic is live";
  }
  return "Push-to-talk (hold button to speak)";
}
