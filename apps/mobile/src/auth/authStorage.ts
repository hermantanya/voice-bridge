import AsyncStorage from "@react-native-async-storage/async-storage";

const AUTH_TOKEN_KEY = "voice-bridge:authToken";

export async function loadAuthToken(): Promise<string | null> {
  const value = await AsyncStorage.getItem(AUTH_TOKEN_KEY);
  return value?.trim() ? value.trim() : null;
}

export async function saveAuthToken(token: string | null): Promise<void> {
  if (!token?.trim()) {
    await AsyncStorage.removeItem(AUTH_TOKEN_KEY);
    return;
  }
  await AsyncStorage.setItem(AUTH_TOKEN_KEY, token.trim());
}
