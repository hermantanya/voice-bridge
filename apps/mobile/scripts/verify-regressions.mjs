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
    required: ["<ScrollView", "Save and go back", "My gender"],
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
    name: "home screen profile badge",
    file: "src/screens/HomeScreen.tsx",
    required: ["formatProfileBadge", "canJoinRoom"],
  },
  {
    name: "socket uses stable join payload refs",
    file: "src/hooks/useSocket.ts",
    required: [
      "speakerGenderRef",
      "buildJoinRoomPayload",
      "participants_sync",
      "releaseTurn",
      "shouldApplyTurnState",
    ],
    forbidden: ["speakerGender,\n    resetTurnState"],
  },
  {
    name: "audio stop returns delivery status",
    file: "src/hooks/useAudio.ts",
    required: ["Promise<boolean>", "pendingStopResolveRef", "nativeStopRequestedRef"],
  },
  {
    name: "mobile feature tests exist",
    file: "src/session/appState.test.ts",
    required: ["buildJoinRoomPayload", "formatProfileBadge"],
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
    ],
    forbidden: ["syncRoomParticipants", "room.participantIds = liveIds"],
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
