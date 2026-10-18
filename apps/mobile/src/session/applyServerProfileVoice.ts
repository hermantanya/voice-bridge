/** Apply server profile voice to device storage (signed-in users; server wins). */
export async function applyServerProfileVoice(
  serverVoiceId: string | null,
  localVoiceId: string | null,
  setLocalVoiceId: (voiceId: string | null) => Promise<void>,
): Promise<void> {
  if (serverVoiceId) {
    if (localVoiceId !== serverVoiceId) {
      await setLocalVoiceId(serverVoiceId);
    }
    return;
  }

  if (localVoiceId) {
    await setLocalVoiceId(null);
  }
}
