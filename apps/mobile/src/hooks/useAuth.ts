import { useCallback, useEffect, useState } from "react";

import { requestAuthOtp, verifyAuthOtp } from "../api/auth";
import {
  fetchProfile,
  patchProfile,
  type ServerProfileResponse,
} from "../api/profile";
import type { LanguageCode, SpeakerGender } from "../config";
import { loadAuthToken, saveAuthToken } from "../auth/authStorage";

export function useAuth() {
  const [session, setSession] = useState<ServerProfileResponse | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const token = await loadAuthToken();
        if (!token) {
          return;
        }
        const profile = await fetchProfile(token);
        if (!cancelled) {
          setSession(profile);
        }
      } catch (loadError) {
        console.warn("Could not restore auth session:", loadError);
        await saveAuthToken(null);
      } finally {
        if (!cancelled) {
          setLoaded(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const signInWithOtp = useCallback(async (email: string, code: string) => {
    setBusy(true);
    setError(null);
    try {
      const { token } = await verifyAuthOtp(email, code);
      await saveAuthToken(token);
      const profile = await fetchProfile(token);
      setSession(profile);
      return profile;
    } catch (signInError) {
      const message =
        signInError instanceof Error ? signInError.message : "Sign-in failed";
      setError(message);
      return null;
    } finally {
      setBusy(false);
    }
  }, []);

  const requestOtp = useCallback(async (email: string) => {
    setBusy(true);
    setError(null);
    try {
      return await requestAuthOtp(email);
    } catch (requestError) {
      const message =
        requestError instanceof Error
          ? requestError.message
          : "Could not send code";
      setError(message);
      return null;
    } finally {
      setBusy(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    await saveAuthToken(null);
    setSession(null);
    setError(null);
  }, []);

  const updateProfile = useCallback(
    async (patch: {
      hearLang?: LanguageCode;
      speakerGender?: SpeakerGender;
    }) => {
      const token = await loadAuthToken();
      if (!token) {
        throw new Error("Not signed in");
      }
      const updated = await patchProfile(token, patch);
      setSession(updated);
      return updated;
    },
    [],
  );

  return {
    session,
    signedIn: Boolean(session),
    loaded,
    busy,
    error,
    requestOtp,
    signInWithOtp,
    signOut,
    updateProfile,
    clearError: () => setError(null),
  };
}
