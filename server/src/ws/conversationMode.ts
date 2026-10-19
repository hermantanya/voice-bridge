export type ConversationMode = "push_to_talk" | "hands_free";

export const DEFAULT_CONVERSATION_MODE: ConversationMode = "push_to_talk";

export function parseConversationMode(
  value: unknown,
): ConversationMode | null {
  if (value === "push_to_talk" || value === "hands_free") {
    return value;
  }
  if (value === undefined || value === null || value === "") {
    return DEFAULT_CONVERSATION_MODE;
  }
  return null;
}
