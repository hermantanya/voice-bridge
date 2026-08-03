import AsyncStorage from "@react-native-async-storage/async-storage";

export const ELEVENLABS_VOICE_ID_STORAGE_KEY =
  "voice-bridge:elevenlabsVoiceId";

export async function loadElevenLabsVoiceId(): Promise<string | null> {
  const value = await AsyncStorage.getItem(ELEVENLABS_VOICE_ID_STORAGE_KEY);
  return value?.trim() ? value.trim() : null;
}

export async function saveElevenLabsVoiceId(
  voiceId: string | null,
): Promise<void> {
  if (!voiceId?.trim()) {
    await AsyncStorage.removeItem(ELEVENLABS_VOICE_ID_STORAGE_KEY);
    return;
  }

  await AsyncStorage.setItem(ELEVENLABS_VOICE_ID_STORAGE_KEY, voiceId.trim());
}
