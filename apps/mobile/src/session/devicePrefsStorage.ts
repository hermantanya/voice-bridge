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
const SAME_ROOM_TEXT_FIRST_KEY = "voice-bridge:sameRoomTextFirst";
const SAME_ROOM_MODE_LEGACY_KEY = "voice-bridge:sameRoomMode";
const SAME_ROOM_PLAY_FINAL_KEY = "voice-bridge:sameRoomPlayFinalVoice";
const USING_HEADPHONES_KEY = "voice-bridge:usingHeadphones";
const STREAMING_PTT_DEV_KEY = "voice-bridge:streamingPttDev";

export type DevicePrefs = {
  hearLang: LanguageCode;
  speakerGender: SpeakerGender;
  conversationMode: ConversationMode;
  playTranslatedVoice: boolean;
  /** Default on: live text while partner speaks; suppress overlapping partial TTS in-person. */
  sameRoomTextFirst: boolean;
  /** When same-room text-first is on, play final TTS after partner releases (still no partial TTS). */
  sameRoomPlayFinalVoice: boolean;
  /** When same-room is on, allow partial/final TTS in headphones without disturbing the room. */
  usingHeadphones: boolean;
  streamingPttDev?: boolean;
};

const VALID_LANGS = new Set<LanguageCode>(["en", "he", "ru"]);
const VALID_GENDERS = new Set<SpeakerGender>(["female", "male"]);
const VALID_CONVERSATION_MODES = new Set<ConversationMode>([
  "push_to_talk",
  "hands_free",
]);

function readSameRoomTextFirst(
  textFirstRaw: string | null,
  legacyModeRaw: string | null,
): boolean {
  const raw = textFirstRaw ?? legacyModeRaw;
  return raw !== "false";
}

export async function loadDevicePrefs(): Promise<DevicePrefs | null> {
  const [
    hearLangRaw,
    genderRaw,
    conversationModeRaw,
    playVoiceRaw,
    sameRoomTextFirstRaw,
    sameRoomLegacyRaw,
    sameRoomFinalRaw,
    usingHeadphonesRaw,
    streamingDevRaw,
  ] = await Promise.all([
    AsyncStorage.getItem(HEAR_LANG_KEY),
    AsyncStorage.getItem(SPEAKER_GENDER_KEY),
    AsyncStorage.getItem(CONVERSATION_MODE_KEY),
    AsyncStorage.getItem(PLAY_TRANSLATED_VOICE_KEY),
    AsyncStorage.getItem(SAME_ROOM_TEXT_FIRST_KEY),
    AsyncStorage.getItem(SAME_ROOM_MODE_LEGACY_KEY),
    AsyncStorage.getItem(SAME_ROOM_PLAY_FINAL_KEY),
    AsyncStorage.getItem(USING_HEADPHONES_KEY),
    AsyncStorage.getItem(STREAMING_PTT_DEV_KEY),
  ]);

  if (
    !hearLangRaw &&
    !genderRaw &&
    !conversationModeRaw &&
    !playVoiceRaw &&
    !sameRoomTextFirstRaw &&
    !sameRoomLegacyRaw &&
    !sameRoomFinalRaw &&
    !usingHeadphonesRaw &&
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
  const sameRoomTextFirst = readSameRoomTextFirst(
    sameRoomTextFirstRaw,
    sameRoomLegacyRaw,
  );
  const sameRoomPlayFinalVoice = sameRoomFinalRaw === "true";
  const usingHeadphones = usingHeadphonesRaw === "true";
  const streamingPttDev = streamingDevRaw === "true";

  return {
    hearLang,
    speakerGender,
    conversationMode,
    playTranslatedVoice,
    sameRoomTextFirst,
    sameRoomPlayFinalVoice,
    usingHeadphones,
    streamingPttDev,
  };
}

export async function saveDevicePrefs(prefs: DevicePrefs): Promise<void> {
  const sameRoomValue = prefs.sameRoomTextFirst ? "true" : "false";
  await Promise.all([
    AsyncStorage.setItem(HEAR_LANG_KEY, prefs.hearLang),
    AsyncStorage.setItem(SPEAKER_GENDER_KEY, prefs.speakerGender),
    AsyncStorage.setItem(CONVERSATION_MODE_KEY, prefs.conversationMode),
    AsyncStorage.setItem(
      PLAY_TRANSLATED_VOICE_KEY,
      prefs.playTranslatedVoice ? "true" : "false",
    ),
    AsyncStorage.setItem(SAME_ROOM_TEXT_FIRST_KEY, sameRoomValue),
    AsyncStorage.setItem(SAME_ROOM_MODE_LEGACY_KEY, sameRoomValue),
    AsyncStorage.setItem(
      SAME_ROOM_PLAY_FINAL_KEY,
      prefs.sameRoomPlayFinalVoice ? "true" : "false",
    ),
    AsyncStorage.setItem(
      USING_HEADPHONES_KEY,
      prefs.usingHeadphones ? "true" : "false",
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
    AsyncStorage.removeItem(SAME_ROOM_TEXT_FIRST_KEY),
    AsyncStorage.removeItem(SAME_ROOM_MODE_LEGACY_KEY),
    AsyncStorage.removeItem(SAME_ROOM_PLAY_FINAL_KEY),
    AsyncStorage.removeItem(USING_HEADPHONES_KEY),
    AsyncStorage.removeItem(STREAMING_PTT_DEV_KEY),
  ]);
}
