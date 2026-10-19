export type PlaybackJob = {
  audioBase64: string;
  play: (audioBase64: string) => Promise<void>;
};

/**
 * Serializes incoming translation audio so overlapping hands-free utterances
 * play in order instead of clipping each other.
 */
export function createTranslationPlaybackQueue() {
  let chain: Promise<void> = Promise.resolve();

  return {
    enqueue(job: PlaybackJob): void {
      chain = chain
        .then(() => job.play(job.audioBase64))
        .catch((error) => {
          console.warn("Translation playback failed:", error);
        });
    },
    reset(): void {
      chain = Promise.resolve();
    },
  };
}
