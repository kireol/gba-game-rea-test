#!/usr/bin/env node
// Scans the repository for trademarked / copyrighted names that must not appear
// in anything this project authors (see the licence section of the project brief
// and docs/asset-provenance.md). Run via `npm run report`.
//
// Exit code 1 = at least one blocking hit outside the acknowledged exceptions.

import { readdirSync, statSync, readFileSync } from "node:fs";
import { join, relative, posix } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;

/** Directories never scanned. */
const SKIP_DIRS = new Set([
  ".git",
  ".qwen",
  "node_modules",
  "dist",
  "build",
  ".cache",
  "rom", // the reference ROM itself: excluded from the sweep by the brief
]);

/** Files excluded by path (relative, posix separators). */
const SKIP_FILES = new Set([
  // User-supplied brief. It names the reference product because it is the
  // instruction to avoid it; it is not project output, never shipped, never
  // rendered. Listed explicitly instead of silently skipped.
  "prompt.md",
  "package-lock.json",
  // This scanner. Its rule table contains every forbidden string by necessity;
  // matching those definitions against themselves is a self-reference, not a hit.
  "scripts/forbidden-name-sweep.mjs",
]);

/** Only these extensions carry project-authored text. */
const TEXT_EXT = new Set([
  ".ts", ".tsx", ".js", ".mjs", ".cjs", ".json", ".html", ".css", ".scss",
  ".md", ".sh", ".yml", ".yaml", ".toml", ".txt", ".env", ".example", ".py",
  ".lua", ".ini", ".gitignore", ".nvmrc",
]);

/**
 * Rules. `severity: "block"` fails the run.
 * `allow` is a list of regexes; a match whose line also matches every-entry-of
 * is ignored (used for the generic term for a falling block, which the brief
 * explicitly permits in code and docs).
 */
const RULES = [
  {
    id: "reference-title",
    severity: "block",
    re: /\bTetris\s*Worlds\b/i,
    note: "the reference product's title",
  },
  {
    id: "tetris",
    severity: "block",
    re: /\btetris\b/i,
    note: "trademark of the mark's owner; use \"piece\" in UI text",
  },
  {
    id: "tetromino",
    severity: "info",
    re: /\btetromino/i,
    note: "generic geometric term, permitted in code/docs (not in UI text)",
  },
  {
    id: "handheld-platform",
    severity: "block",
    re: /\bGame\s*Boy\b|\bGame\s*Cube\b|\bNintendo\s*DS\b/i,
    note: "platform holder trademark; say \"the reference platform\"",
  },
  {
    id: "gba",
    severity: "block",
    re: /\bGBA\b|\bGB[Aa]\b/,
    note: "platform abbreviation; forbidden in player-facing text",
    // A bare file extension is how the ROM is located, which the brief allows.
    allow: [/\.gba\b/, /maxdepth 1 -name '\*\.gba'/],
  },
  {
    id: "rights-holder",
    severity: "block",
    re: /\bThe Tetris Company\b|\bNintendo\b|\bTHQ\b|\bRadical Entertainment\b|\bElorg\b|\bBlue Planet\b|\bWarashi\b|\bAtari\b/i,
    note: "publisher / developer / licensor / platform holder name",
  },
  {
    id: "reference-mode-name",
    severity: "block",
    re: /\b(marathon|ultra|sprint|novice|master\s*challenge)\b/i,
    note: "plausible original mode name — do not reuse; see docs/game-design.md",
  },
  {
    id: "wordmark-ish",
    severity: "info",
    re: /\bWorlds\b/,
    note: "branding-adjacent word; confirm it is not used as UI text or branding",
  },
];

/** Paths whose `gba` / mode-name hits are acknowledged and reported, not failed. */
const ACKNOWLEDGED = new Map([
  [
    "scripts/start-mgba.sh",
    "ROM file extension used to locate the locally supplied reference image",
  ],
  [
    "docs/reverse-engineering/rom-overview.md",
    "file extension used to identify the analysed image for reproducibility",
  ],
]);

const walk = (dir, out = []) => {
  for (const name of readdirSync(dir)) {
    if (name === ".DS_Store") continue;
    const abs = join(dir, name);
    const rel = relative(ROOT, abs).split(/[\\/]/).join(posix.sep);
    const st = statSync(abs);
    if (st.isDirectory()) {
      if (SKIP_DIRS.has(name) || rel.startsWith("docs/reverse-engineering/screenshots")) continue;
      walk(abs, out);
    } else if (TEXT_EXT.has(name.includes(".") ? "." + name.split(".").pop() : name) || name === ".gitignore") {
      if (!SKIP_FILES.has(rel)) out.push({ abs, rel });
    }
  }
  return out;
};

const findings = [];
let infoCount = 0;
const files = walk(ROOT);

for (const { abs, rel } of files) {
  let text;
  try {
    text = readFileSync(abs, "utf8");
  } catch {
    continue;
  }
  if (text.includes("\0")) continue; // binary
  const lines = text.split("\n");
  for (const rule of RULES) {
    rule.re.lastIndex = 0;
    lines.forEach((line, i) => {
      if (!rule.re.test(line)) return;
      if (rule.allow?.some((a) => a.test(line))) return;
      if (rule.severity === "info") {
        infoCount++;
        findings.push({ rel, line: i + 1, rule, lineText: line.trim().slice(0, 120) });
        return;
      }
      const ack = ACKNOWLEDGED.get(rel);
      findings.push({ rel, line: i + 1, rule, lineText: line.trim().slice(0, 120), ack });
    });
  }
}

const blocking = findings.filter((f) => f.rule.severity === "block" && !f.ack);
const acked = findings.filter((f) => f.rule.severity === "block" && f.ack);

console.log(`forbidden-name sweep — ${files.length} files scanned\n`);

const byRule = new Map();
for (const f of findings) byRule.set(f.rule.id, (byRule.get(f.rule.id) ?? 0) + 1);
for (const [id, n] of [...byRule].sort((a, b) => b[1] - a[1])) console.log(`  ${id.padEnd(22)} ${n}`);

if (acked.length) {
  console.log(`\nacknowledged exceptions (${acked.length}) — reported, not failed:`);
  for (const f of acked.slice(0, 12)) {
    console.log(`  ${f.rel}:${f.line}  [${f.rule.id}] — ${ACKNOWLEDGED.get(f.rel)}`);
  }
  if (acked.length > 12) console.log(`  … ${acked.length - 12} more`);
}

const infos = findings.filter((f) => f.rule.severity === "info");
if (infos.length) {
  console.log(`\ninformational (${infos.length}) — check by hand:`);
  for (const f of infos.slice(0, 25)) console.log(`  ${f.rel}:${f.line}  [${f.rule.id}] ${f.lineText}`);
  if (infos.length > 25) console.log(`  … ${infos.length - 25} more`);
}

if (blocking.length) {
  console.log(`\nBLOCKING (${blocking.length}) — must be renamed/reworded:`);
  for (const f of blocking) console.log(`  ${f.rel}:${f.line}  [${f.rule.id}] ${f.rule.note}\n    ${f.lineText}`);
  console.log("\nFAIL");
  process.exit(1);
}
console.log("\nPASS — no blocking hits");
