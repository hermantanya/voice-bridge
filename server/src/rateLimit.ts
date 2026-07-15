type Bucket = {
  count: number;
  resetAt: number;
};

export type RateLimiter = {
  allow: (key: string) => boolean;
  remainingMs: (key: string) => number;
};

export function createRateLimiter(max: number, windowMs: number): RateLimiter {
  const buckets = new Map<string, Bucket>();

  return {
    allow(key: string): boolean {
      const now = Date.now();
      const bucket = buckets.get(key);

      if (!bucket || now >= bucket.resetAt) {
        buckets.set(key, { count: 1, resetAt: now + windowMs });
        return true;
      }

      if (bucket.count >= max) {
        return false;
      }

      bucket.count += 1;
      return true;
    },

    remainingMs(key: string): number {
      const bucket = buckets.get(key);
      if (!bucket) {
        return 0;
      }

      return Math.max(0, bucket.resetAt - Date.now());
    },
  };
}

export function clientIp(
  address: string | undefined,
  forwardedFor: string | undefined,
): string {
  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() ?? "unknown";
  }

  return address ?? "unknown";
}
