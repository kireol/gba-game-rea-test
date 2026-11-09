#!/usr/bin/env node
// Turns the Vite output into one self-contained HTML page — `dist/orbit-drop.html`
// — that opens straight from the filesystem: no server, no node, nothing else to
// copy. Node is only ever needed to *produce* the file, never to run it.
//
// Why the served `dist/index.html` cannot be double-clicked: Vite emits
// `<script type="module" crossorigin src="./assets/index-*.js">`, and a module
// script fetched by a `file://` page is fetched against the opaque `null` origin,
// which Chromium and Safari both refuse. An inline module script performs no fetch
// at all, so it runs from disk. The page's stylesheet is already inline, and the
// game makes no other request (`base: './'`, no runtime dependencies, all art and
// audio generated in code), so the bundle is the only thing to fold in.
//
// Run via `npm run build:single`, after `vite build`.
//
// Exit code 1 = the build output is not in the shape this step can inline.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const DIST = join(ROOT, "dist");
const OUT = join(DIST, "orbit-drop.html");
const OUT_LABEL = join("dist", "orbit-drop.html");

/** Emitted module scripts, e.g. `<script type="module" crossorigin src="./assets/index-x.js"></script>`. */
const SCRIPT_WITH_SRC = /<script\b[^>]*\bsrc="([^"]*)"[^>]*>\s*<\/script>/gi;

/** A source map cannot travel inside the page, and a dangling reference is devtools noise. */
const SOURCEMAP_COMMENT = /^\s*\/\/# sourceMappingURL=.*$/gm;

/** References that are not files in `dist/`, so they need no inlining. */
const TRAVELS_BY_ITSELF = /^(?:data:|#|mailto:|javascript:)/i;

/**
 * `./assets/index.js` → its path in `dist/`, or null for anything a `file://` page
 * could not load from disk anyway (site-absolute path, another origin).
 */
const distFile = (ref) => {
  const clean = ref.split(/[?#]/)[0];
  if (!clean || clean.startsWith("/") || /^[a-z][a-z\d+.-]*:\/\//i.test(clean)) return null;
  return join(DIST, clean);
};

/**
 * Inside script data the HTML tokenizer closes the block at the first `</script`,
 * and a `<!--` followed by `<script` can move it into the double-escaped state
 * where the closing tag itself gets swallowed. Both are rewritten to JavaScript
 * escapes that evaluate back to the original characters.
 */
const htmlSafe = (js) => js.replace(/<\/script/gi, "<\\/script").replace(/<!--/g, "<\\u0021--");

const count = (text, re) => (text.match(re) ?? []).length;

const htmlPath = join(DIST, "index.html");
if (!existsSync(htmlPath)) {
  console.error(`inline-single-file: no dist/index.html — run \`vite build\` first`);
  process.exit(1);
}

const html = readFileSync(htmlPath, "utf8");
const problems = [];
let inlined = 0;

const page = html.replace(SCRIPT_WITH_SRC, (tag, ref) => {
  const file = distFile(ref);
  if (!file || !existsSync(file)) {
    problems.push(`script src="${ref}" is not a file inside dist/`);
    return tag;
  }
  const source = readFileSync(file, "utf8").replace(SOURCEMAP_COMMENT, "");
  const attrs = tag
    .slice(0, tag.indexOf(">"))
    .replace(/\s*\bsrc="[^"]*"/i, "")
    .replace(/\s*\bcrossorigin\b(?:="[^"]*")?/i, "");
  inlined += 1;
  return `${attrs}>\n${htmlSafe(source)}\n</script>`;
});

// Anything still referencing a file would be a request the single page cannot make:
// a stylesheet Vite hoisted, a modulepreload, an asset import. Fail rather than
// ship a page that half works from disk.
const stragglers = [...page.matchAll(/<(?:script|link|img|source)\b[^>]*\b(?:src|href)="([^"]*)"/gi)]
  .map((match) => match[1])
  .filter((ref) => ref && !TRAVELS_BY_ITSELF.test(ref));
if (stragglers.length > 0) problems.push(`external references survive inlining: ${stragglers.join(", ")}`);

// Every block terminator in the result must come from a script tag we rewrote; a
// payload that smuggled one in would truncate the page.
const closers = count(page, /<\/script/gi) - count(html, /<\/script/gi);
if (closers !== 0) problems.push(`inlining changed the </script count by ${closers}`);

if (problems.length > 0) {
  for (const problem of problems) console.error(`inline-single-file: ${problem}`);
  process.exit(1);
}

writeFileSync(OUT, page);
console.log(
  `${OUT_LABEL}: ${inlined} inlined script(s), ${(Buffer.byteLength(page) / 1024).toFixed(0)} KB, no external references`,
);
