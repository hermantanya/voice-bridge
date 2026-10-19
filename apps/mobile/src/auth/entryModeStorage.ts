import AsyncStorage from "@react-native-async-storage/async-storage";

const GUEST_MODE_KEY = "voice-bridge:guestMode";

export async function loadGuestMode(): Promise<boolean> {
  const value = await AsyncStorage.getItem(GUEST_MODE_KEY);
  return value === "true";
}

export async function saveGuestMode(enabled: boolean): Promise<void> {
  if (enabled) {
    await AsyncStorage.setItem(GUEST_MODE_KEY, "true");
    return;
  }
  await AsyncStorage.removeItem(GUEST_MODE_KEY);
}
