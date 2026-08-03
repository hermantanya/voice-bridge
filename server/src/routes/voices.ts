import { Router } from "express";

import {
  buildVoiceCloneName,
  enrollmentPreviewText,
  enrollmentSampleFilename,
  validateVoiceEnrollmentRequest,
  validateVoicePreviewRequest,
  type VoiceEnrollmentRequest,
} from "../voices/enrollment.js";
import {
  createInstantVoiceCloneFromBuffer,
  deleteElevenLabsVoice,
  ELEVENLABS_IVC_TTS_DEFAULTS,
  elevenLabsLanguageCodeForTts,
  elevenLabsModelForLanguage,
  synthesizeElevenLabsSpeech,
} from "../voices/elevenlabs.js";

export const voicesRouter = Router();

voicesRouter.post("/enroll", async (req, res) => {
  try {
    const validated = validateVoiceEnrollmentRequest(
      req.body as VoiceEnrollmentRequest,
    );

    if (!validated.ok) {
      res.status(400).json({ error: validated.error });
      return;
    }

    const voice = await createInstantVoiceCloneFromBuffer({
      name: buildVoiceCloneName(validated.language),
      sample: validated.audio,
      sampleFilename: enrollmentSampleFilename(validated.format),
      description: "Voice Bridge v1.2 private IVC enrollment",
      removeBackgroundNoise: false,
      gender: validated.gender,
    });

    if (validated.replaceVoiceId && validated.replaceVoiceId !== voice.voice_id) {
      try {
        await deleteElevenLabsVoice(validated.replaceVoiceId);
      } catch (error) {
        console.warn(
          `Could not delete replaced voice ${validated.replaceVoiceId}:`,
          error,
        );
      }
    }

    const previewText = enrollmentPreviewText(
      validated.language,
      validated.gender,
    );
    const modelId = elevenLabsModelForLanguage(validated.language);
    const previewAudio = await synthesizeElevenLabsSpeech({
      text: previewText,
      voiceId: voice.voice_id,
      modelId,
      languageCode: elevenLabsLanguageCodeForTts(
        validated.language,
        modelId,
      ),
      voiceSettings: ELEVENLABS_IVC_TTS_DEFAULTS.voiceSettings,
    });

    res.json({
      voiceId: voice.voice_id,
      previewText,
      previewAudioBase64: previewAudio.toString("base64"),
      previewAudioFormat: "mp3",
    });
  } catch (error) {
    console.error("voice enroll error:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Voice enrollment failed",
    });
  }
});

voicesRouter.post("/preview", async (req, res) => {
  try {
    const validated = validateVoicePreviewRequest(req.body);

    if (!validated.ok) {
      res.status(400).json({ error: validated.error });
      return;
    }

    const previewText = enrollmentPreviewText(
      validated.language,
      validated.gender,
    );
    const modelId = elevenLabsModelForLanguage(validated.language);
    const previewAudio = await synthesizeElevenLabsSpeech({
      text: previewText,
      voiceId: validated.voiceId,
      modelId,
      languageCode: elevenLabsLanguageCodeForTts(
        validated.language,
        modelId,
      ),
      voiceSettings: ELEVENLABS_IVC_TTS_DEFAULTS.voiceSettings,
    });

    res.json({
      voiceId: validated.voiceId,
      previewText,
      previewAudioBase64: previewAudio.toString("base64"),
      previewAudioFormat: "mp3",
    });
  } catch (error) {
    console.error("voice preview error:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Voice preview failed",
    });
  }
});

voicesRouter.delete("/:voiceId", async (req, res) => {
  try {
    const voiceId = req.params.voiceId?.trim();
    if (!voiceId) {
      res.status(400).json({ error: "voiceId is required" });
      return;
    }

    await deleteElevenLabsVoice(voiceId);
    res.json({ ok: true });
  } catch (error) {
    console.error("voice delete error:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Voice delete failed",
    });
  }
});
