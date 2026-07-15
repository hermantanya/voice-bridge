import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";

import { registerSocketHandlers } from "./ws/handler.js";
import { translateRouter } from "./routes/translate.js";

dotenv.config();

const PORT = Number(process.env.PORT) || 3001;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN ?? "*";

const app = express();
const httpServer = createServer(app);

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
  express.raw({ type: "*/*", limit: "15mb" }),
  translateRouter,
);

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "voice-bridge-server",
    version: "1.0.0",
    timestamp: new Date().toISOString(),
  });
});

registerSocketHandlers(io);

httpServer.listen(PORT, () => {
  console.log(`voice-bridge server listening on port ${PORT}`);
});
