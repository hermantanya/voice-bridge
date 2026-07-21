import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";

import { registerSocketHandlers } from "./ws/handler.js";
import { createSocketRateLimits, registerRateLimitMiddleware } from "./ws/rateLimit.js";
import { translateRouter } from "./routes/translate.js";
import { clientIp, createRateLimiter } from "./rateLimit.js";

dotenv.config();

const PORT = Number(process.env.PORT) || 3001;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN ?? "*";
const translatePerHour = Number(process.env.RATE_LIMIT_TRANSLATE_PER_HOUR ?? 30);
const translateLimiter = createRateLimiter(translatePerHour, 60 * 60_000);
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

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "voice-bridge-server",
    version: "1.1.0",
    timestamp: new Date().toISOString(),
  });
});

registerRateLimitMiddleware(io, socketRateLimits);
registerSocketHandlers(io, socketRateLimits);

httpServer.listen(PORT, () => {
  console.log(`voice-bridge server listening on port ${PORT}`);
});
