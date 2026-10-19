/** Ensures only one native recorder owns the mic (PTT vs hands-free listen). */

let releaseHandsFreeMic: (() => Promise<void>) | null = null;

export function registerHandsFreeMicRelease(
  release: (() => Promise<void>) | null,
): void {
  releaseHandsFreeMic = release;
}

export async function releaseHandsFreeMicBeforePushToTalk(): Promise<void> {
  if (!releaseHandsFreeMic) {
    return;
  }
  await releaseHandsFreeMic();
}
