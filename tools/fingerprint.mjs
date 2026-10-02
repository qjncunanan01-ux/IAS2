// Content-hash fingerprinting for the no-build asset pipeline.
//
// Every local .js/.css/.svg asset gets a short content hash (sha256, 8 hex
// chars, computed with line endings normalized to LF so Windows checkouts
// and CI agree). References are rewritten to `path.ext?v=<hash>`:
//
//   - HTML: <script src>, <link href> (stylesheet/icon) — relative or
//     root-relative, same-origin files only.
//   - JS: static `import ... from "./x.js"`, side-effect `import "./x.js"`,
//     and dynamic `import("./x.js")` specifiers.
//
// Hashes are computed over each file's content with any existing `?v=`
// queries STRIPPED — so a file's hash depends only on its own code, never
// on the hashes embedded in its imports. This is what makes the scheme
// converge in a single pass and immune to import cycles (auth.js <-> ui.js
// exist in this codebase): a file's URL changes only when its own content
// changes, exactly like bundler content hashes. Stale dependencies are
// still re-fetched because each importer references them with their fresh
// hash — and HTML is served no-cache, so the graph always re-resolves from
// the top. Fingerprinted files are safe to cache as immutable (.htaccess).
//
// Usage:
//   node tools/fingerprint.mjs --check   Verify refs are current (CI gate)
//   node tools/fingerprint.mjs --apply   Rewrite refs in place

import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Modules that must keep bare specifiers: ESM module identity is keyed by
// the full URL (query included), so a fingerprinted specifier would create
// a SECOND instance of a shared-mutable-state singleton alongside any bare
// import of the same file (tests, console access via window.app). Pure
// modules double-instantiate harmlessly; state.js does not.
// .htaccess MUST serve these with no-cache — guarded by tests/cache-policy.test.js.
export const UNFINGERPRINTED = new Set(["js/modules/state.js"]);

// ---------- helpers ----------

export function computeShortHash(content) {
  const normalized = String(content).replace(/\r\n/g, "\n");
  return createHash("sha256").update(normalized, "utf8").digest("hex").slice(0, 8);
}

function listFiles(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) listFiles(full, out);
    else out.push(full);
  }
  return out;
}

// ---------- reference scanning ----------

// Static/side-effect/dynamic import specifiers inside a JS module.
const IMPORT_PATTERNS = [
  /import\s+["']([^"']+)["']/g, // side-effect: import "./x.js";
  /import\s+[^;'"()]*?from\s+["']([^"']+)["']/g, // named/default/namespace
  /import\s*\(\s*["']([^"']+)["']\s*\)/g // dynamic: import("./x.js")
];

// Local asset refs in HTML (src/href attributes, same-origin files only).
const HTML_REF_PATTERN = /(?:\ssrc|\shref)\s*=\s*"([^"]+)"/g;

const FINGERPRINTABLE = /\.(js|css|svg)(\?v=[0-9a-f]{8})?$/i;

function isLocalRef(ref) {
  return ref.startsWith(".") || ref.startsWith("/");
}

// HTML src/href may be bare relative paths ("styles.css", "js/main.js"),
// so "local" means anything that is not scheme-qualified or protocol-relative
// (excludes https://, data:, //cdn..., mailto:, etc.).
function isLocalHtmlRef(ref) {
  return !ref.startsWith("//") && !/^[a-z][a-z0-9+.-]*:/i.test(ref);
}

function resolveRef(fromFile, ref, root) {
  const clean = ref.split("?")[0];
  // Source paths may be given relative to the root ("js/main.js") or absolute.
  const baseDir = path.dirname(path.isAbsolute(fromFile) ? fromFile : path.join(root, fromFile));
  return clean.startsWith("/")
    ? path.join(root, clean)
    : path.resolve(baseDir, clean);
}

/** Collect { full, ref, targetPath } asset references from source text. */
export function findRefs(sourcePath, source, root = ROOT) {
  const refs = [];
  const isHtml = sourcePath.endsWith(".html");
  const patterns = isHtml ? [HTML_REF_PATTERN] : IMPORT_PATTERNS;
  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    let m;
    while ((m = pattern.exec(source)) !== null) {
      const ref = m[1];
      const local = isHtml ? isLocalHtmlRef(ref) : isLocalRef(ref);
      if (!local || !FINGERPRINTABLE.test(ref)) continue;
      const targetPath = resolveRef(sourcePath, ref, root);
      refs.push({ full: m[0], ref, targetPath });
    }
  }
  return refs;
}

// ---------- rewriting ----------

/**
 * Rewrite all fingerprintable refs in `source` using the hash map
 * (absolute path -> short hash). Existing `?v=` values are replaced when
 * stale; bare refs gain `?v=`. Returns { output, rewritten, missing }.
 */
export function rewriteSource(sourcePath, source, hashes, root = ROOT) {
  let output = source;
  const rewritten = [];
  const missing = [];
  const seen = new Set();
  for (const { full, ref, targetPath } of findRefs(sourcePath, source, root)) {
    if (seen.has(full)) continue;
    seen.add(full);
    const hash = hashes.get(targetPath);
    const rel = path.relative(root, targetPath).split(path.sep).join("/");
    const exempt = UNFINGERPRINTED.has(rel);
    if (exempt && !/\?v=/i.test(ref)) continue; // already bare — nothing to do
    if (!hash && !exempt) {
      missing.push(ref);
      continue;
    }
    let updated;
    if (exempt) {
      // Singleton identity: strip any query so the specifier stays bare.
      updated = full.replace(ref, ref.replace(/\?v=[0-9a-f]{8}/i, ""));
    } else if (/\?v=[0-9a-f]{8}$/i.test(ref)) {
      // Replace within `ref` (which ends at the hash), then splice back into
      // `full` — anchoring on `full` would never match: statements end with
      // ";" or a quote, attributes with a closing quote.
      const refreshed = ref.replace(/(\?v=)[0-9a-f]{8}$/i, `$1${hash}`);
      updated = hash === ref.slice(-8) ? full : full.replace(ref, refreshed);
    } else {
      updated = full.replace(ref, `${ref}?v=${hash}`);
    }
    if (updated !== full) {
      output = output.split(full).join(updated);
      rewritten.push({
        from: ref,
        to: exempt ? ref.replace(/\?v=[0-9a-f]{8}/i, "") : `${ref.split("?")[0]}?v=${hash}`
      });
    }
  }
  return { output, rewritten, missing };
}

// ---------- graph ----------

/** Strip fingerprint queries so hashes never depend on embedded refs. */
function stripQueries(source) {
  return source.replace(/\?v=[0-9a-f]{8}/gi, "");
}

export function buildHashMap(root = ROOT) {
  const hashes = new Map();
  const jsDir = path.join(root, "js");
  const vendorDir = path.join(root, "assets", "vendor");
  const files = [];
  if (statSync(jsDir, { throwIfNoEntry: false })) files.push(...listFiles(jsDir));
  if (statSync(vendorDir, { throwIfNoEntry: false })) files.push(...listFiles(vendorDir));
  for (const file of ["styles.css", "assets/placeholder.svg"]) {
    const full = path.join(root, file);
    if (statSync(full, { throwIfNoEntry: false })) files.push(full);
  }
  for (const file of files) {
    const rel = path.relative(root, file).split(path.sep).join("/");
    if (UNFINGERPRINTED.has(rel)) continue;
    hashes.set(file, computeShortHash(stripQueries(readFileSync(file, "utf8"))));
  }
  return hashes;
}

// ---------- check / apply ----------

const HTML_FILES = ["index.html", "404.html"];

export function collectTargets(root = ROOT) {
  const targets = [];
  for (const file of HTML_FILES) {
    const full = path.join(root, file);
    if (statSync(full, { throwIfNoEntry: false })) targets.push(full);
  }
  const jsDir = path.join(root, "js");
  if (statSync(jsDir, { throwIfNoEntry: false })) targets.push(...listFiles(jsDir));
  return targets;
}

export function runCheck(root = ROOT) {
  const hashes = buildHashMap(root);
  let failures = 0;
  for (const file of collectTargets(root)) {
    const source = readFileSync(file, "utf8");
    const { output, rewritten, missing } = rewriteSource(file, source, hashes, root);
    if (missing.length) {
      console.error(`✖ ${path.relative(root, file)}: unresolvable refs: ${missing.join(", ")}`);
      failures += 1;
      continue;
    }
    if (output !== source) {
      console.error(`✖ ${path.relative(root, file)}: stale fingerprint(s):`);
      for (const { from, to } of rewritten) console.error(`    ${from}  →  ${to}`);
      failures += 1;
    }
  }
  return failures;
}

export function runApply(root = ROOT) {
  // A file's hash depends only on its own stripped content, so one pass
  // converges regardless of import depth or cycles.
  const hashes = buildHashMap(root);
  let changed = 0;
  for (const file of collectTargets(root)) {
    const source = readFileSync(file, "utf8");
    const { output, rewritten, missing } = rewriteSource(file, source, hashes, root);
    if (missing.length) {
      console.error(`✖ ${path.relative(root, file)}: unresolvable refs: ${missing.join(", ")}`);
      process.exitCode = 1;
      continue;
    }
    if (output !== source) {
      writeFileSync(file, output);
      changed += 1;
      console.log(`✓ ${path.relative(root, file)} (${rewritten.length} ref${rewritten.length === 1 ? "" : "s"})`);
    }
  }
  return changed;
}

function main() {
  const mode = process.argv[2] ?? "--check";
  if (mode === "--apply") {
    const changed = runApply();
    console.log(changed ? `${changed} file(s) updated.` : "All fingerprints already current.");
    return;
  }
  if (mode === "--check") {
    const failures = runCheck();
    if (failures) {
      console.error(`\n${failures} file(s) have stale fingerprints.`);
      console.error("Run: node tools/fingerprint.mjs --apply");
      process.exitCode = 1;
      return;
    }
    console.log("All asset fingerprints are current.");
    return;
  }
  console.error("Usage: node tools/fingerprint.mjs [--check | --apply]");
  process.exitCode = 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main();
}
