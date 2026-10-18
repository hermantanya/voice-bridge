import crypto from "node:crypto";

import { normalizeEmail } from "../users/profileTypes.js";

type PendingOtp = {
  code: string;
  expiresAtMs: number;
  lastSentAtMs: number;
};

const pendingByEmail = new Map<string, PendingOtp>();

const OTP_TTL_MS = 10 * 60_000;
const RESEND_COOLDOWN_MS = 60_000;

function generateOtpCode(): string {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
}

export type RequestOtpResult =
  | { ok: true; code: string }
  | { ok: false; error: string; retryAfterMs?: number };

export function requestOtp(email: string): RequestOtpResult {
  const normalized = normalizeEmail(email);
  const now = Date.now();
  const existing = pendingByEmail.get(normalized);

  if (existing && now - existing.lastSentAtMs < RESEND_COOLDOWN_MS) {
    return {
      ok: false,
      error: "Wait before requesting another code",
      retryAfterMs: RESEND_COOLDOWN_MS - (now - existing.lastSentAtMs),
    };
  }

  const code = generateOtpCode();
  pendingByEmail.set(normalized, {
    code,
    expiresAtMs: now + OTP_TTL_MS,
    lastSentAtMs: now,
  });

  return { ok: true, code };
}

export function verifyOtp(email: string, code: string): boolean {
  const normalized = normalizeEmail(email);
  const pending = pendingByEmail.get(normalized);
  if (!pending) {
    return false;
  }

  const now = Date.now();
  if (now > pending.expiresAtMs) {
    pendingByEmail.delete(normalized);
    return false;
  }

  const normalizedCode = code.trim();
  if (normalizedCode.length !== 6 || pending.code !== normalizedCode) {
    return false;
  }

  pendingByEmail.delete(normalized);
  return true;
}

/** Test helper */
export function clearPendingOtps(): void {
  pendingByEmail.clear();
}
