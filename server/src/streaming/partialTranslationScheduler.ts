/**
 * Trailing debounce for partial translation while source text grows during hold.
 */
export type PartialTranslationScheduler = {
  /** Source text changed; schedule or reschedule a translate. */
  bump: () => void;
  /** Run translate immediately (e.g. after a VAD phrase boundary). */
  flush: () => Promise<void>;
  cancel: () => void;
};

export function createPartialTranslationScheduler(input: {
  debounceMs?: number;
  run: () => Promise<void>;
}): PartialTranslationScheduler {
  const debounceMs = input.debounceMs ?? 400;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let flushPromise: Promise<void> | null = null;

  const runNow = async () => {
    if (flushPromise) {
      await flushPromise;
    }
    flushPromise = input.run().finally(() => {
      flushPromise = null;
    });
    await flushPromise;
  };

  return {
    bump() {
      if (timer) {
        clearTimeout(timer);
      }
      timer = setTimeout(() => {
        timer = null;
        void runNow();
      }, debounceMs);
    },
    async flush() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      await runNow();
    },
    cancel() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    },
  };
}
