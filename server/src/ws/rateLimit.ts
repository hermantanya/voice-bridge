import type { Server } from "socket.io";

import { clientIp, createRateLimiter, type RateLimiter } from "../rateLimit.js";

export type SocketRateLimits = {
  join: RateLimiter;
  audio: RateLimiter;
};

export function createSocketRateLimits(): SocketRateLimits {
  const joinPerMinute = Number(process.env.RATE_LIMIT_JOIN_PER_MINUTE ?? 20);
  const audioPerHour = Number(process.env.RATE_LIMIT_AUDIO_PER_HOUR ?? 120);

  return {
    join: createRateLimiter(joinPerMinute, 60_000),
    audio: createRateLimiter(audioPerHour, 60 * 60_000),
  };
}

export function registerRateLimitMiddleware(
  io: Server,
  limits: SocketRateLimits,
): void {
  io.use((socket, next) => {
    const ip = clientIp(
      socket.handshake.address,
      socket.handshake.headers["x-forwarded-for"] as string | undefined,
    );

    socket.data.clientIp = ip;

    if (!limits.join.allow(ip)) {
      return next(new Error("Too many connection attempts"));
    }

    next();
  });
}

export function rejectIfAudioLimited(
  socketId: string,
  limits: SocketRateLimits,
): string | null {
  if (!limits.audio.allow(socketId)) {
    const retryMs = limits.audio.remainingMs(socketId);
    const retryMinutes = Math.max(1, Math.ceil(retryMs / 60_000));
    return `Rate limit exceeded. Try again in about ${retryMinutes} minute(s).`;
  }

  return null;
}
