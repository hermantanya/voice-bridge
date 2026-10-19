import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const mobileRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const serverRoot = join(mobileRoot, "..", "..", "server");

function read(relativePath, root = mobileRoot) {
  return readFileSync(join(root, relativePath), "utf8");
}

const checks = [
  {
    name: "settings scrollable on all platforms",
    file: "src/screens/SettingsScreen.tsx",
    required: ["<ScrollView", "Save and go back", "My gender", "Translate to"],
    forbidden: ['Platform.OS === "web"'],
  },
  {
    name: "hold-to-talk race guard extracted and used",
    file: "src/session/holdToTalkSession.ts",
    required: ["cancelled_before_record", "releaseTurn", "Promise<boolean>"],
  },
  {
    name: "App uses shared hold-to-talk session helper",
    file: "App.tsx",
    required: ["runHoldToTalkStart", "shouldForceStopRecording", "normalizeRoomCode"],
  },
  {
    name: "session screen uses shared turn label logic",
    file: "src/screens/SessionScreen.tsx",
    required: ["getTurnLabel", "canStartTalking", "stillHolding", "isRecording"],
  },
  {
    name: "session screen scrollable with top hold-to-talk",
    file: "src/screens/SessionScreen.tsx",
    required: [
      "<ScrollView",
      "scrollEnabled={!isRecording}",
      "styles.talkSection",
      "Hold to talk",
      'embedded',
    ],
    forbidden: ["styles.footer"],
  },
  {
    name: "transcript panel supports embedded scroll parent",
    file: "src/components/TranscriptPanel.tsx",
    required: ["embedded?: boolean", "containerEmbedded", "embeddedContent"],
  },
  {
    name: "home screen profile badge",
    file: "src/screens/HomeScreen.tsx",
    required: ["formatProfileBadge", "canJoinRoom", "voiceStatus", "voiceStatusDot"],
  },
  {
    name: "socket uses stable join payload refs",
    file: "src/hooks/useSocket.ts",
    required: [
      "speakerGenderRef",
      "elevenlabsVoiceIdRef",
      "buildJoinRoomPayload",
      "participants_sync",
      "releaseTurn",
      "shouldApplyTurnState",
    ],
    forbidden: ["speakerGender,\n    resetTurnState", "sourceLang: myLang"],
  },
  {
    name: "socket re-joins when voice profile updates",
    file: "src/hooks/useSocket.ts",
    required: ["emitJoinRoom", "connectedRef", "usedClonedVoice"],
  },
  {
    name: "socket handles streaming partial partner events",
    file: "src/hooks/useSocket.ts",
    required: [
      "partial_transcript",
      "partial_translation",
      "partial_translation_audio",
      "partnerPartial",
      "setPartnerPartial",
    ],
  },
  {
    name: "socket appends written translation transcript events",
    file: "src/hooks/useSocket.ts",
    required: [
      "translation_transcript",
      "translation_sent_transcript",
      "translation_result",
      "translation_sent",
      "appendTranscriptIfNew",
      "applyTranslationResultToTranscript",
      "flushPartnerPartialToTranscript",
    ],
  },
  {
    name: "batch PTT upload when streaming uplink off",
    file: "App.tsx",
    required: [
      "streamingPttUplink",
      "sendAudioChunk",
      "stopStreamingPtt",
      "Promise<boolean>",
    ],
    forbidden: ["if (streamingPttUplink) {\n        void socket.stopStreamingPtt"],
  },
  {
    name: "session transcript panel render path",
    file: "src/screens/SessionScreen.tsx",
    required: ["transcript:", "TranscriptPanel", "entries={transcript}"],
  },
  {
    name: "App session memo tracks transcript updates",
    file: "App.tsx",
    required: [
      "transcript={socket.transcript}",
      "socket.transcript",
      "socket.partnerPartial",
    ],
  },
  {
    name: "transcript reducer unit tests exist",
    file: "src/session/transcriptState.test.ts",
    required: [
      "translation_transcript",
      "translation_result",
      "flushPartnerPartialToTranscript",
    ],
  },
  {
    name: "session shows partner live partial card",
    file: "src/screens/SessionScreen.tsx",
    required: [
      "Partner (live)",
      "partnerPartial",
      "accessibilityLiveRegion",
      "shouldShowPartnerLiveCard",
      "getPartnerLiveSourceLine",
      "getPartnerLiveTranslationLine",
    ],
  },
  {
    name: "socket merges streaming partner partial chunks",
    file: "src/hooks/useSocket.ts",
    required: ["mergePartnerPartial", "translation_transcript"],
  },
  {
    name: "App re-renders session on partner partial updates",
    file: "App.tsx",
    required: [
      "partnerPartial={socket.partnerPartial}",
      "socket.partnerPartial",
      "onPartialTranslationAudio",
      "playTranslatedVoice",
    ],
  },
  {
    name: "speaker must not play own translation TTS",
    file: "src/hooks/useSocket.ts",
    required: [
      "shouldPlayTranslationAudio",
      'kind: "translation_result"',
      'kind: "partial_translation_audio"',
      "participantIdRef.current",
      'socket.on("translation_result"',
      'socket.on("translation_sent"',
    ],
    forbidden: [],
  },
  {
    name: "App playback guards speaker vs listener TTS",
    file: "App.tsx",
    required: [
      "shouldAutoPlayTranslationAudio",
      "myParticipantIdRef",
      'kind: "translation_result"',
      'kind: "partial_translation_audio"',
    ],
  },
  {
    name: "same-room playback policy unit tests",
    file: "src/session/translationPlayback.test.ts",
    required: [
      "shouldAutoPlayTranslationAudio",
      "usingHeadphones",
      "sameRoomTextFirst",
    ],
  },
  {
    name: "settings same-room and headphones copy",
    file: "src/screens/SettingsScreen.tsx",
    required: [
      "Same room (text first)",
      "Using headphones",
      "sameRoomTextFirst",
      "usingHeadphones",
    ],
  },
  {
    name: "App uses same-room playback prefs",
    file: "App.tsx",
    required: [
      "shouldAutoPlayTranslationAudio",
      "sameRoomTextFirst",
      "usingHeadphones",
    ],
  },
  {
    name: "translation playback unit tests exist",
    file: "src/session/translationPlayback.test.ts",
    required: [
      "shouldPlayTranslationAudio",
      "translation_sent",
      "partial_translation_audio",
      'role: "speaker"',
    ],
  },
  {
    name: "streaming uplink only on speaker turn",
    file: "src/hooks/useSocket.ts",
    required: [
      "isLocalStreamingSpeaker",
      "start skipped (listener",
      "isLiveTranscriptionUnavailableMessage",
      "partial_translation",
      "fromParticipantId === participantIdRef.current",
    ],
  },
  {
    name: "web speaker streaming start soft-fails to batch",
    file: "App.tsx",
    required: [
      "handleStreamingRecordingStarted",
      "startStreamingPtt",
      "socket.isMyTurn",
    ],
    forbidden: [
      "Could not start streaming session",
      "Live transcript unavailable",
    ],
  },
  {
    name: "voice profile hook and storage exist",
    file: "src/hooks/useVoiceProfile.ts",
    required: [
      "loadElevenLabsVoiceId",
      "saveElevenLabsVoiceId",
      "voiceStatus",
      "removeElevenLabsVoice",
    ],
  },
  {
    name: "voice setup screen exists",
    file: "src/screens/VoiceSetupScreen.tsx",
    required: [
      "Set up my voice",
      "Stop recording",
      "Create my voice",
      "enrollVoice",
      "MIN_ENROLLMENT_DURATION_MS",
      "getEnrollmentPrompt",
    ],
  },
  {
    name: "enrollment recording respects saved web microphone",
    file: "src/hooks/useEnrollmentRecording.ts",
    required: ["acquireWebMicrophoneStream"],
  },
  {
    name: "voice setup script language picker",
    file: "src/screens/VoiceSetupScreen.tsx",
    required: ["Script language", "scriptLang", "setScriptLang"],
  },
  {
    name: "settings voice preview from enrolled voice",
    file: "src/screens/SettingsScreen.tsx",
    required: ["Play voice preview", "previewEnrolledVoice", "playVoicePreviewAudio"],
  },
  {
    name: "audio stop returns delivery status",
    file: "src/hooks/useAudio.ts",
    required: ["Promise<boolean>", "pendingStopResolveRef", "nativeStopRequestedRef"],
  },
  {
    name: "mobile feature tests exist",
    file: "src/session/appState.test.ts",
    required: [
      "buildJoinRoomPayload",
      "hearLang",
      "formatProfileBadge",
      "voiceProfileLabel",
      "resolveVoiceProfileStatus",
    ],
    forbidden: ["speakLang:"],
  },
  {
    name: "server join race fix and release_turn",
    file: "src/ws/handler.ts",
    root: serverRoot,
    required: [
      "reconcileParticipantsOnJoin",
      "reconcileParticipantsFromLive",
      "participants_sync",
      "release_turn",
      "speakerGender",
      "elevenlabsVoiceId",
      "speakerVoiceId",
      "resolveTargetLanguage",
      "socket.data.hearLang",
      "skippedTts",
      "usedClonedVoice",
    ],
    forbidden: ["syncRoomParticipants", "room.participantIds = liveIds"],
  },
  {
    name: "voice enrollment route and ElevenLabs pipeline",
    file: "src/routes/voices.ts",
    root: serverRoot,
    required: [
      "createInstantVoiceCloneFromBuffer",
      "deleteElevenLabsVoice",
      "previewAudioBase64",
      "/preview",
    ],
  },
  {
    name: "pipeline auto-detect and same-language skip",
    file: "src/pipeline/index.ts",
    root: serverRoot,
    required: ["sourceLangOverride", "skippedTts", "shouldSkipTranslation"],
  },
  {
    name: "stt whisper auto-detect",
    file: "src/pipeline/stt.ts",
    root: serverRoot,
    required: ["verbose_json", "languageOverride", "detectedLang"],
  },
  {
    name: "pipeline uses cloned voice when voiceId is present",
    file: "src/pipeline/index.ts",
    root: serverRoot,
    required: ["voiceId?: string", "voiceId: input.voiceId"],
  },
  {
    name: "gender translation prompt extracted and tested",
    file: "src/pipeline/genderInstruction.ts",
    root: serverRoot,
    required: ["buildGenderInstruction", "addresseeGender"],
  },
  {
    name: "server regression tests exist",
    file: "src/ws/join-room.integration.test.ts",
    root: serverRoot,
    required: [
      "two clients joining the same room",
      "concurrent joins still converge",
      "release_turn reopens the floor",
    ],
  },
];

const failures = [];

for (const check of checks) {
  const root = check.root ?? mobileRoot;
  const source = read(check.file, root);

  for (const needle of check.required ?? []) {
    if (!source.includes(needle)) {
      failures.push(`${check.name}: missing ${needle}`);
    }
  }

  for (const needle of check.forbidden ?? []) {
    if (source.includes(needle)) {
      failures.push(`${check.name}: forbidden ${needle}`);
    }
  }
}

if (failures.length > 0) {
  console.error("Regression checks failed:");
  for (const failure of failures) {
    console.error(`  - ${failure}`);
  }
  process.exit(1);
}

console.log(`Regression checks passed (${checks.length} suites).`);
