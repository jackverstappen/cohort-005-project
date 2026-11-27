// Fails when a file is too big for an agent to read and edit in one go.
// Tokens are estimated as bytes / 4, which is close enough for code.
// Usage:
//   node scripts/check-file-tokens.js <file>...   — explicit paths (pre-commit)
//   node scripts/check-file-tokens.js --all       — every tracked file (CI),
//     using scripts/oversize-baseline.json to tolerate pre-existing offenders.

import { execSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const MAX_TOKENS = 5000;
const BYTES_PER_TOKEN = 4;
const BASELINE_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "oversize-baseline.json"
);

// Generated files that nobody edits by hand, and workflow files, which
// GitHub reads as one file each and which cannot be split.
const IGNORED = [
  /(^|\/)package-lock\.json$/,
  /^drizzle\//,
  /^\.github\/workflows\/[^/]+\.yml$/,
];

const isBinary = (contents) => contents.subarray(0, 8000).includes(0);

const args = process.argv.slice(2);
const useAll = args[0] === "--all";
const files = useAll
  ? execSync("git ls-files", { encoding: "utf8" }).split("\n").filter(Boolean)
  : args;

const baseline = useAll
  ? Object.fromEntries(
      Object.entries(JSON.parse(readFileSync(BASELINE_PATH, "utf8"))).filter(
        ([key]) => !key.startsWith("_")
      )
    )
  : {};

const measured = files
  .map((file) => file.replaceAll("\\", "/").replace(`${process.cwd()}/`, ""))
  .filter((file) => !IGNORED.some((pattern) => pattern.test(file)))
  // `git ls-files` lists submodule paths as directories; skip them.
  .filter((file) => {
    try {
      return statSync(file).isFile();
    } catch {
      return false;
    }
  })
  .map((file) => ({ file, contents: readFileSync(file) }))
  .filter(({ contents }) => !isBinary(contents))
  .map(({ file, contents }) => ({
    file,
    tokens: Math.ceil(contents.length / BYTES_PER_TOKEN),
  }));

const oversized = measured.filter(({ file, tokens }) => {
  if (tokens <= MAX_TOKENS) return false;
  if (!useAll) return true;
  const baselined = baseline[file];
  return baselined === undefined || tokens > baselined;
});

const stale = useAll
  ? Object.keys(baseline).filter((file) => {
      const current = measured.find((entry) => entry.file === file);
      return !current || current.tokens <= MAX_TOKENS;
    })
  : [];

if (useAll && Object.keys(baseline).length > 0 && oversized.length === 0) {
  console.log(
    `Baseline: ${Object.keys(baseline).length} pre-existing file(s) over ${MAX_TOKENS} tokens. Split them to ratchet the limit down.`
  );
  for (const file of Object.keys(baseline)) {
    const current = measured.find((entry) => entry.file === file);
    if (current) console.log(`  ${file}: ~${current.tokens} tokens`);
  }
}

if (stale.length > 0) {
  console.error(
    `\nThese entries in scripts/oversize-baseline.json are stale — the file is gone or under the limit. Delete them:\n`
  );
  for (const file of stale) console.error(`  ${file}`);
  process.exit(1);
}

if (oversized.length > 0) {
  console.error(`These files are over ${MAX_TOKENS} tokens (bytes / 4):\n`);
  for (const { file, tokens } of oversized) {
    const baselined = baseline[file];
    const suffix = baselined !== undefined ? ` (baseline ${baselined})` : "";
    console.error(`  ${file}: ~${tokens} tokens${suffix}`);
  }
  console.error(`
Split each file before you commit. Do not delete code or squash it onto fewer
lines to get under the limit.

How to split:
- Find the seams. Look for groups of functions, components, or tests that
  change together and share little with the rest of the file.
- Route modules (app/routes/*): keep the loader, action, and page component in
  the route file. Move the business logic into a module in app/modules/ and
  sub-components into their own files in app/components/.
- Logic that is already in a module (app/modules/<name>/): split it into more
  files under lib/. Keep the entry points (index.ts, index.server.ts) small. Do
  not add a barrel file. See app/modules/README.md.
- Tests: split by the behaviour under test, one file per area (for example
  <name>.refunds.test.ts, <name>.permissions.test.ts). Move shared fixtures
  into a fixtures file in the same tests/ folder.
- Scripts and seed data: move large data literals into their own files and
  import them.

When you are done, run \`npm run check\` and commit again.`);
  process.exit(1);
}
