import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = readFileSync(
  join(root, "src/screens/SettingsScreen.tsx"),
  "utf8",
);

const required = [
  ["<ScrollView", "scrollable settings layout"],
  ["Save and go back", "save button label"],
  [">Back</Text>", "discard back button"],
  ["handleSaveAndBack", "save applies draft settings"],
  ["Sign in", "guest account sign-in entry"],
  ["Create account", "guest account create entry"],
  ["showMicrophoneSettings", "microphone settings section"],
  ["My gender", "gender settings section"],
  ["My voice", "voice profile section"],
  ["Set up my voice", "voice setup entry point"],
  ["voiceProfileLabel", "voice profile status label"],
  ["paddingTop: 64", "desktop top padding"],
];

const forbidden = [
  ['Platform.OS === "web"', "platform-specific layout split"],
];

const failures = [
  ...required.filter(([needle]) => !source.includes(needle)),
  ...forbidden.filter(([needle]) => source.includes(needle)),
];

if (failures.length > 0) {
  console.error("SettingsScreen layout checks failed:");
  for (const [, label] of failures) {
    console.error(`  - ${label}`);
  }
  process.exit(1);
}

console.log("SettingsScreen layout checks passed.");
