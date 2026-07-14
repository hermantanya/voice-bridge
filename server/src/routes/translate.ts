import { Router } from "express";

import { runTranslationPipeline } from "../pipeline/index.js";

export const translateRouter = Router();

translateRouter.post("/", async (req, res) => {
  try {
    const sourceLang = String(req.query.sourceLang ?? "en");
    const targetLang = String(req.query.targetLang ?? "he");
    const format = String(req.query.format ?? "webm");

    const audio = req.body;

    if (!Buffer.isBuffer(audio) || audio.length === 0) {
      res.status(400).json({ error: "Request body must contain raw audio bytes" });
      return;
    }

    const result = await runTranslationPipeline({
      audio,
      sourceLang,
      targetLang,
      format,
    });

    res.json({
      sourceLang: result.sourceLang,
      targetLang: result.targetLang,
      sourceText: result.sourceText,
      translatedText: result.translatedText,
      audioBase64: result.audio.toString("base64"),
      audioFormat: result.audioFormat,
      latencyMs: result.latencyMs,
    });
  } catch (error) {
    console.error("translate route error:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Translation failed",
    });
  }
});
