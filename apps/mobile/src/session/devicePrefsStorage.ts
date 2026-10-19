import AsyncStorage from "@react-native-async-storage/async-storage";

import type {
  ConversationMode,
  LanguageCode,
  SpeakerGender,
} from "../config";

const HEAR_LANG_KEY = "voice-bridge:hearLang";
const SPEAKER_GENDER_KEY = "voice-bridge:speakerGender";
const CONVERSATION_MODE_KEY = "voice-bridge:conversationMode";
const PLAY_TRANSLATED_VOICE_KEY = "voice-bridge:playTranslatedVoice";
const STREAMING_PTT_DEV_KEY = "voice-bridge:streamingPttDev";

export type DevicePrefs = {
  hearLang: LanguageCode;
  speakerGender: SpeakerGender;
  conversationMode: ConversationMode;
  playTranslatedVoice: boolean;
  streamingPttDev?: boolean;
};

const VALID_LANGS = new Set<LanguageCode>(["en", "he", "ru"]);
const VALID_GENDERS = new Set<SpeakerGender>(["female", "male"]);
const VALID_CONVERSATION_MODES = new Set<ConversationMode>([
  "push_to_talk",
  "hands_free",
]);

export async function loadDevicePrefs(): Promise<DevicePrefs | null> {
  const [hearLangRaw, genderRaw, conversationModeRaw, playVoiceRaw, streamingDevRaw] =
    await Promise.all([
      AsyncStorage.getItem(HEAR_LANG_KEY),
      AsyncStorage.getItem(SPEAKER_GENDER_KEY),
      AsyncStorage.getItem(CONVERSATION_MODE_KEY),
      AsyncStorage.getItem(PLAY_TRANSLATED_VOICE_KEY),
      AsyncStorage.getItem(STREAMING_PTT_DEV_KEY),
    ]);

  if (
    !hearLangRaw &&
    !genderRaw &&
    !conversationModeRaw &&
    !playVoiceRaw &&
    !streamingDevRaw
  ) {
    return null;
  }

  const hearLang = VALID_LANGS.has(hearLangRaw as LanguageCode)
    ? (hearLangRaw as LanguageCode)
    : "en";
  const speakerGender = VALID_GENDERS.has(genderRaw as SpeakerGender)
    ? (genderRaw as SpeakerGender)
    : "female";
  const storedMode = VALID_CONVERSATION_MODES.has(
    conversationModeRaw as ConversationMode,
  )
    ? (conversationModeRaw as ConversationMode)
    : "push_to_talk";
  const conversationMode =
    storedMode === "hands_free" ? "push_to_talk" : storedMode;
  const playTranslatedVoice = playVoiceRaw !== "false";
  const streamingPttDev = streamingDevRaw === "true";

  return {
    hearLang,
    speakerGender,
    conversationMode,
    playTranslatedVoice,
    streamingPttDev,
  };
}

export async function saveDevicePrefs(prefs: DevicePrefs): Promise<void> {
  await Promise.all([
    AsyncStorage.setItem(HEAR_LANG_KEY, prefs.hearLang),
    AsyncStorage.setItem(SPEAKER_GENDER_KEY, prefs.speakerGender),
    AsyncStorage.setItem(CONVERSATION_MODE_KEY, prefs.conversationMode),
    AsyncStorage.setItem(
      PLAY_TRANSLATED_VOICE_KEY,
      prefs.playTranslatedVoice ? "true" : "false",
    ),
    AsyncStorage.setItem(
      STREAMING_PTT_DEV_KEY,
      prefs.streamingPttDev ? "true" : "false",
    ),
  ]);
}

export async function clearDevicePrefs(): Promise<void> {
  await Promise.all([
    AsyncStorage.removeItem(HEAR_LANG_KEY),
    AsyncStorage.removeItem(SPEAKER_GENDER_KEY),
    AsyncStorage.removeItem(CONVERSATION_MODE_KEY),
    AsyncStorage.removeItem(PLAY_TRANSLATED_VOICE_KEY),
    AsyncStorage.removeItem(STREAMING_PTT_DEV_KEY),
  ]);
}
