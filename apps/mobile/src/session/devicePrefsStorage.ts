import AsyncStorage from "@react-native-async-storage/async-storage";

import type { LanguageCode, SpeakerGender } from "../config";

const HEAR_LANG_KEY = "voice-bridge:hearLang";
const SPEAKER_GENDER_KEY = "voice-bridge:speakerGender";

export type DevicePrefs = {
  hearLang: LanguageCode;
  speakerGender: SpeakerGender;
};

const VALID_LANGS = new Set<LanguageCode>(["en", "he", "ru"]);
const VALID_GENDERS = new Set<SpeakerGender>(["female", "male"]);

export async function loadDevicePrefs(): Promise<DevicePrefs | null> {
  const [hearLangRaw, genderRaw] = await Promise.all([
    AsyncStorage.getItem(HEAR_LANG_KEY),
    AsyncStorage.getItem(SPEAKER_GENDER_KEY),
  ]);

  if (!hearLangRaw && !genderRaw) {
    return null;
  }

  const hearLang = VALID_LANGS.has(hearLangRaw as LanguageCode)
    ? (hearLangRaw as LanguageCode)
    : "en";
  const speakerGender = VALID_GENDERS.has(genderRaw as SpeakerGender)
    ? (genderRaw as SpeakerGender)
    : "female";

  return { hearLang, speakerGender };
}

export async function saveDevicePrefs(prefs: DevicePrefs): Promise<void> {
  await Promise.all([
    AsyncStorage.setItem(HEAR_LANG_KEY, prefs.hearLang),
    AsyncStorage.setItem(SPEAKER_GENDER_KEY, prefs.speakerGender),
  ]);
}

export async function clearDevicePrefs(): Promise<void> {
  await Promise.all([
    AsyncStorage.removeItem(HEAR_LANG_KEY),
    AsyncStorage.removeItem(SPEAKER_GENDER_KEY),
  ]);
}
