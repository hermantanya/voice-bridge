import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";

import { registerSocketHandlers } from "./ws/handler.js";
import { createSocketRateLimits, registerRateLimitMiddleware } from "./ws/rateLimit.js";
import { authRouter } from "./routes/auth.js";
import { profileRouter } from "./routes/profile.js";
import { translateRouter } from "./routes/translate.js";
import { voicesRouter } from "./routes/voices.js";
import { runMigrations } from "./db/migrate.js";
import { getDatabaseUrl } from "./db/pool.js";
import { clientIp, createRateLimiter } from "./rateLimit.js";

dotenv.config();

const PORT = Number(process.env.PORT) || 3001;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN ?? "*";
const translatePerHour = Number(process.env.RATE_LIMIT_TRANSLATE_PER_HOUR ?? 30);
const enrollPerHour = Number(process.env.RATE_LIMIT_ENROLL_PER_HOUR ?? 10);
const translateLimiter = createRateLimiter(translatePerHour, 60 * 60_000);
const enrollLimiter = createRateLimiter(enrollPerHour, 60 * 60_000);
const socketRateLimits = createSocketRateLimits();

const app = express();
const httpServer = createServer(app);

app.set("trust proxy", 1);

const io = new Server(httpServer, {
  cors: {
    origin: CLIENT_ORIGIN === "*" ? true : CLIENT_ORIGIN.split(","),
    methods: ["GET", "POST"],
  },
});

app.use(cors({ origin: CLIENT_ORIGIN === "*" ? true : CLIENT_ORIGIN.split(",") }));
app.use(express.json({ limit: "15mb" }));

app.use(
  "/api/translate",
  (req, res, next) => {
    const ip = clientIp(req.ip, req.headers["x-forwarded-for"] as string | undefined);

    if (!translateLimiter.allow(ip)) {
      const retryMinutes = Math.max(
        1,
        Math.ceil(translateLimiter.remainingMs(ip) / 60_000),
      );
      res.status(429).json({
        error: `Rate limit exceeded. Try again in about ${retryMinutes} minute(s).`,
      });
      return;
    }

    next();
  },
  express.raw({ type: "*/*", limit: "15mb" }),
  translateRouter,
);

app.use("/api/auth", authRouter);
app.use("/api/profile", profileRouter);

app.use(
  "/api/voices",
  (req, res, next) => {
    const ip = clientIp(req.ip, req.headers["x-forwarded-for"] as string | undefined);

    if (!enrollLimiter.allow(ip)) {
      const retryMinutes = Math.max(
        1,
        Math.ceil(enrollLimiter.remainingMs(ip) / 60_000),
      );
      res.status(429).json({
        error: `Enrollment rate limit exceeded. Try again in about ${retryMinutes} minute(s).`,
      });
      return;
    }

    next();
  },
  voicesRouter,
);

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "voice-bridge-server",
    version: "1.4.0",
    timestamp: new Date().toISOString(),
  });
});

registerRateLimitMiddleware(io, socketRateLimits);
registerSocketHandlers(io, socketRateLimits);

async function start(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    httpServer.listen(PORT, () => {
      console.log(`voice-bridge server listening on port ${PORT}`);
      resolve();
    });
    httpServer.once("error", reject);
  });

  if (!getDatabaseUrl()) {
    return;
  }

  try {
    await runMigrations();
    console.log("PostgreSQL migrations applied (users table ready)");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("PostgreSQL migration failed (sign-in disabled until fixed):", message);
    console.error(
      "Hint: On Railway, try Supabase Session pooler (port 5432) if Transaction (6543) fails, enable SSL, URL-encode password, or use Supabase IPv4 add-on.",
    );
  }
}

start().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error("Failed to start server:", message);
  process.exit(1);
});
