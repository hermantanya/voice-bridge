import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const mobileRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = join(mobileRoot, "..", "..");

function read(relativePath, root = repoRoot) {
  return readFileSync(join(root, relativePath), "utf8");
}

function readJson(relativePath, root = repoRoot) {
  return JSON.parse(read(relativePath, root));
}

function parseSemver(version) {
  const match = String(version).match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) {
    throw new Error(`invalid semver: ${version}`);
  }
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

function semverToNumber({ major, minor, patch }) {
  return major * 1_000_000 + minor * 1_000 + patch;
}

function minorTag({ major, minor }) {
  return `v${major}.${minor}`;
}

const failures = [];
const rootPkg = readJson("package.json");
const version = rootPkg.version;
const semver = parseSemver(version);
const readme = read("README.md");
const executionPlan = read("EXECUTION_PLAN.md");

function fail(message) {
  failures.push(message);
}

// 1. Root package.json version is present (sanity)
if (!version) {
  fail("root package.json: missing version field");
}

// 2. README marks current release
const currentPattern = new RegExp(
  String.raw`\*\*v${semver.major}\.${semver.minor}\s*\(current\)(?::\*\*|\*\*)`,
);
if (!currentPattern.test(readme)) {
  fail(
    `README.md: expected **v${semver.major}.${semver.minor} (current)** (or with trailing colon) near the top`,
  );
}

// 3. README roadmap: shipped minors through current; next minor not done yet
const roadmapSection = readme.includes("## Roadmap")
  ? readme.slice(readme.indexOf("## Roadmap"))
  : readme;

for (let minor = 0; minor <= semver.minor; minor += 1) {
  const tag = minorTag({ major: semver.major, minor });
  const donePattern = new RegExp(
    String.raw`\*\*${tag}\*\*\s*\(done\)`,
    "i",
  );
  if (!donePattern.test(roadmapSection)) {
    fail(`README roadmap: ${tag} should be marked (done) at version ${version}`);
  }
}

const nextMinor = semver.minor + 1;
const nextTag = minorTag({ major: semver.major, minor: nextMinor });
const nextDonePattern = new RegExp(
  String.raw`\*\*${nextTag}\*\*\s*\(done\)`,
  "i",
);
if (nextDonePattern.test(roadmapSection)) {
  fail(
    `README roadmap: ${nextTag} must not be marked (done) until version >= ${semver.major}.${nextMinor}.0`,
  );
}

// 4. EXECUTION_PLAN reflects shipped current minor (not "Next")
const shippedMinor = minorTag(semver);
if (!executionPlan.includes(`${shippedMinor} shipped`)) {
  fail(
    `EXECUTION_PLAN.md: expected "Last updated" or body to mention "${shippedMinor} shipped"`,
  );
}

const planV13Next = /\*\*v1\.3\*\*[^|\n]*\|\s*📋\s*Next/i.test(executionPlan);
if (planV13Next && semverToNumber(semver) >= semverToNumber(parseSemver("1.3.0"))) {
  fail("EXECUTION_PLAN.md: v1.3 must not be listed as Next after v1.3 shipped");
}

const planCurrentShipped = new RegExp(
  String.raw`\*\*${shippedMinor}\*\*[^|\n]*\|\s*✅\s*Shipped`,
);
if (!planCurrentShipped.test(executionPlan)) {
  fail(
    `EXECUTION_PLAN.md: current state table should show **${shippedMinor}** as ✅ Shipped`,
  );
}

const planNextMinor = minorTag({ major: semver.major, minor: semver.minor + 1 });
const planNextRow = new RegExp(
  String.raw`\*\*${planNextMinor}\*\*[^|\n]*\|\s*📋\s*Next`,
);
if (!planNextRow.test(executionPlan)) {
  fail(
    `EXECUTION_PLAN.md: expected **${planNextMinor}** as 📋 Next in current state table`,
  );
}

// 5. package.json versions aligned (root, server, mobile)
const serverVersion = readJson("package.json", join(repoRoot, "server")).version;
const mobileVersion = readJson("package.json", mobileRoot).version;

for (const [label, pkgVersion] of [
  ["server/package.json", serverVersion],
  ["apps/mobile/package.json", mobileVersion],
]) {
  if (pkgVersion !== version) {
    fail(
      `${label}: version ${pkgVersion} does not match root package.json ${version}`,
    );
  }
}

// 6. Server /health version matches root semver exactly
const serverIndex = read("src/index.ts", join(repoRoot, "server"));
const healthVersionMatch = serverIndex.match(
  /app\.get\("\/health"[\s\S]*?version:\s*"([^"]+)"/,
);
if (!healthVersionMatch) {
  fail("server/src/index.ts: could not find /health version field");
} else if (healthVersionMatch[1] !== version) {
  fail(
    `server/src/index.ts: /health version "${healthVersionMatch[1]}" !== root ${version}`,
  );
}

if (failures.length > 0) {
  console.error("Doc alignment checks failed:");
  for (const message of failures) {
    console.error(`  - ${message}`);
  }
  process.exit(1);
}

console.log(`Doc alignment checks passed (version ${version}).`);
