import crypto from "node:crypto";

export type AuthTokenPayload = {
  sub: string;
  email: string;
};

function base64UrlEncode(input: Buffer | string): string {
  const buffer = typeof input === "string" ? Buffer.from(input, "utf8") : input;
  return buffer
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlDecode(input: string): Buffer {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/");
  const padLen = (4 - (padded.length % 4)) % 4;
  return Buffer.from(padded + "=".repeat(padLen), "base64");
}

export function signAuthToken(
  payload: AuthTokenPayload,
  secret: string,
  ttlSeconds: number,
): string {
  const header = base64UrlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const now = Math.floor(Date.now() / 1000);
  const body = base64UrlEncode(
    JSON.stringify({
      ...payload,
      iat: now,
      exp: now + ttlSeconds,
    }),
  );
  const signature = crypto
    .createHmac("sha256", secret)
    .update(`${header}.${body}`)
    .digest();
  return `${header}.${body}.${base64UrlEncode(signature)}`;
}

export function verifyAuthToken(
  token: string,
  secret: string,
): { ok: true; payload: AuthTokenPayload } | { ok: false; error: string } {
  const parts = token.split(".");
  if (parts.length !== 3) {
    return { ok: false, error: "Invalid token format" };
  }

  const [headerPart, bodyPart, signaturePart] = parts;
  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${headerPart}.${bodyPart}`)
    .digest();
  const actual = base64UrlDecode(signaturePart);

  if (
    expected.length !== actual.length ||
    !crypto.timingSafeEqual(expected, actual)
  ) {
    return { ok: false, error: "Invalid token signature" };
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(base64UrlDecode(bodyPart).toString("utf8")) as Record<
      string,
      unknown
    >;
  } catch {
    return { ok: false, error: "Invalid token payload" };
  }

  const exp = parsed.exp;
  if (typeof exp !== "number" || exp <= Math.floor(Date.now() / 1000)) {
    return { ok: false, error: "Token expired" };
  }

  const sub = parsed.sub;
  const email = parsed.email;
  if (typeof sub !== "string" || !sub || typeof email !== "string" || !email) {
    return { ok: false, error: "Invalid token claims" };
  }

  return { ok: true, payload: { sub, email } };
}

export function getAuthJwtSecret(): string {
  const secret = process.env.AUTH_JWT_SECRET?.trim();
  if (secret) {
    return secret;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("AUTH_JWT_SECRET is required in production");
  }
  return "voice-bridge-dev-jwt-secret-change-me";
}

export function authTokenTtlSeconds(): number {
  const days = Number(process.env.AUTH_JWT_TTL_DAYS ?? 30);
  if (!Number.isFinite(days) || days <= 0) {
    return 30 * 24 * 60 * 60;
  }
  return Math.floor(days * 24 * 60 * 60);
}
