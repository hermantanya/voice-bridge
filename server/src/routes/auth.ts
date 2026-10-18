import { Router } from "express";

import {
  authTokenTtlSeconds,
  getAuthJwtSecret,
  signAuthToken,
} from "../auth/jwt.js";
import { requestOtp, verifyOtp } from "../auth/otp.js";
import { sendOtpEmail } from "../auth/sendOtpEmail.js";
import { isValidEmail, normalizeEmail } from "../users/profileTypes.js";
import { getUserStore } from "../users/userStore.js";

export const authRouter = Router();

function publicProfile(user: {
  id: string;
  email: string;
  profile: {
    hearLang: string;
    speakerGender: string;
    elevenlabsVoiceId: string | null;
  };
}) {
  return {
    id: user.id,
    email: user.email,
    profile: user.profile,
  };
}

authRouter.post("/request-otp", async (req, res) => {
  const emailRaw = (req.body as { email?: unknown })?.email;
  if (typeof emailRaw !== "string" || !isValidEmail(emailRaw)) {
    res.status(400).json({ error: "Valid email is required" });
    return;
  }

  const email = normalizeEmail(emailRaw);
  const otpResult = requestOtp(email);
  if (!otpResult.ok) {
    res.status(429).json({
      error: otpResult.error,
      retryAfterMs: otpResult.retryAfterMs,
    });
    return;
  }

  const emailResult = await sendOtpEmail(email, otpResult.code);
  const exposeDevCode =
    process.env.AUTH_DEV_RETURN_OTP === "true" ||
    process.env.NODE_ENV !== "production";

  if (!emailResult.sent && !exposeDevCode) {
    res.status(503).json({
      error: "Email delivery is not configured on this server",
    });
    return;
  }

  res.json({
    ok: true,
    message: emailResult.sent
      ? "Check your email for a sign-in code."
      : "Sign-in code logged on server (email not configured).",
    ...(exposeDevCode ? { devCode: otpResult.code } : {}),
  });
});

authRouter.post("/verify-otp", async (req, res) => {
  const body = req.body as { email?: unknown; code?: unknown };
  const emailRaw = body.email;
  const codeRaw = body.code;

  if (typeof emailRaw !== "string" || !isValidEmail(emailRaw)) {
    res.status(400).json({ error: "Valid email is required" });
    return;
  }

  if (typeof codeRaw !== "string" || !/^\d{6}$/.test(codeRaw.trim())) {
    res.status(400).json({ error: "A 6-digit code is required" });
    return;
  }

  const email = normalizeEmail(emailRaw);
  if (!verifyOtp(email, codeRaw)) {
    res.status(401).json({ error: "Invalid or expired code" });
    return;
  }

  const user = await getUserStore().getOrCreateByEmail(email);
  const token = signAuthToken(
    { sub: user.id, email: user.email },
    getAuthJwtSecret(),
    authTokenTtlSeconds(),
  );

  res.json({
    token,
    user: publicProfile(user),
  });
});
