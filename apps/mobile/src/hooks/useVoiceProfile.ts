import { useCallback, useEffect, useState } from "react";

import { deleteEnrolledVoice } from "../api/enrollVoice";
import {
  resolveVoiceProfileStatus,
  type VoiceProfileStatus,
} from "../session/appState";
import {
  loadElevenLabsVoiceId,
  saveElevenLabsVoiceId,
} from "../session/voiceProfileStorage";

export function useVoiceProfile() {
  const [elevenlabsVoiceId, setElevenlabsVoiceIdState] = useState<
    string | null
  >(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void loadElevenLabsVoiceId().then((voiceId) => {
      if (cancelled) {
        return;
      }
      setElevenlabsVoiceIdState(voiceId);
      setLoaded(true);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const setElevenLabsVoiceId = useCallback(async (voiceId: string | null) => {
    await saveElevenLabsVoiceId(voiceId);
    setElevenlabsVoiceIdState(voiceId?.trim() ? voiceId.trim() : null);
  }, []);

  const removeElevenLabsVoice = useCallback(async () => {
    const current = elevenlabsVoiceId;
    if (current) {
      try {
        await deleteEnrolledVoice(current);
      } catch (error) {
        console.warn("Could not delete enrolled voice on server:", error);
      }
    }

    await saveElevenLabsVoiceId(null);
    setElevenlabsVoiceIdState(null);
  }, [elevenlabsVoiceId]);

  const voiceStatus: VoiceProfileStatus =
    resolveVoiceProfileStatus(elevenlabsVoiceId);

  return {
    elevenlabsVoiceId,
    voiceStatus,
    loaded,
    setElevenLabsVoiceId,
    removeElevenLabsVoice,
  };
}
