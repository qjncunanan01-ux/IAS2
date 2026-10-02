// Module-identity invariant tests.
//
// ESM keys module identity by full URL, so `order-admin.js` and
// `order-admin.js?v=4d38044b` are TWO different instances. If any app code
// (or a console harness) imports a module bare while the rest of the graph
// uses fingerprinted specifiers, that second instance comes up with fresh
// module-local state — empty `els`, disconnected handlers — and fails
// confusingly at runtime. These tests pin the rule: every import of an app
// module carries the ?v= fingerprint, except the sanctioned bare singleton
// (state.js, the UNFINGERPRINTED exemption that must also never be cached
// immutable — guarded from the other side by tests/cache-policy.test.js).

import assert from "node:assert/strict";
import { test } from "node:test";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { UNFINGERPRINTED } from "../tools/fingerprint.mjs";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const JS_ROOT = path.join(PROJECT_ROOT, "js");

const QUERY_RE = /\?v=[0-9a-f]{8}/;

function listJsFiles(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) listJsFiles(full, out);
    else if (entry.name.endsWith(".js")) out.push(full);
  }
  return out;
}

// Strip comments so prose that merely mentions imports can't trip the scan,
// then pull every import specifier (static, side-effect, dynamic, re-export).
function importSpecifiers(source) {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const specifiers = [];
  const patterns = [
    /import\s+[^'"()]*?from\s*["']([^"']+)["']/g,
    /import\s*["']([^"']+)["']/g,
    /import\s*\(\s*["']([^"']+)["']\s*\)/g,
    /export\s+[^'"()]*?from\s*["']([^"']+)["']/g
  ];
  for (const pattern of patterns) {
    for (const match of code.matchAll(pattern)) specifiers.push(match[1]);
  }
  return specifiers;
}

// Resolve a relative or root-relative specifier to its project-root path,
// and return null for bare (package-style) specifiers.
function resolveSpecifier(specifier, importerRel) {
  if (specifier.startsWith(".")) {
    return path.posix.normalize(path.posix.join(path.posix.dirname(importerRel), specifier));
  }
  if (specifier.startsWith("/")) return specifier.slice(1);
  return null;
}

test("every app-module import uses the fingerprinted specifier (or the sanctioned exemption)", () => {
  const offenders = [];
  for (const file of listJsFiles(JS_ROOT)) {
    const rel = path.relative(PROJECT_ROOT, file).replace(/\\/g, "/");
    for (const spec of importSpecifiers(readFileSync(file, "utf8"))) {
      const resolved = resolveSpecifier(spec, rel);
      if (!resolved || !resolved.endsWith(".js")) continue;
      if (UNFINGERPRINTED.has(resolved.split("?")[0])) continue;
      if (!QUERY_RE.test(spec)) offenders.push(`${rel} -> ${spec}`);
    }
  }
  assert.deepEqual(offenders, [], "bare imports create a second ESM instance — add the ?v= fingerprint");
});

test("UNFINGERPRINTED exemptions never carry a ?v= query anywhere in app code", () => {
  const offenders = [];
  for (const file of listJsFiles(JS_ROOT)) {
    const rel = path.relative(PROJECT_ROOT, file).replace(/\\/g, "/");
    for (const spec of importSpecifiers(readFileSync(file, "utf8"))) {
      const resolved = resolveSpecifier(spec, rel);
      if (!resolved) continue;
      // Exempt module WITH a query is exactly the double-instance bug.
      if (UNFINGERPRINTED.has(resolved) && /\?/.test(spec)) {
        offenders.push(`${rel} -> ${spec}`);
      }
    }
  }
  assert.deepEqual(
    offenders,
    [],
    "fingerprinting a shared-mutable singleton would double-instantiate it — keep bare"
  );
});

test("UNFINGERPRINTED list stays accurate: members exist and cover every bare import", () => {
  for (const member of UNFINGERPRINTED) {
    assert.ok(existsSync(path.join(PROJECT_ROOT, member)), `exempt file missing: ${member}`);
    assert.ok(member.endsWith(".js"), "exemptions are app modules only");
  }

  const bareImported = new Set();
  for (const file of listJsFiles(JS_ROOT)) {
    const rel = path.relative(PROJECT_ROOT, file).replace(/\\/g, "/");
    for (const spec of importSpecifiers(readFileSync(file, "utf8"))) {
      const resolved = resolveSpecifier(spec, rel);
      if (resolved?.endsWith(".js") && !QUERY_RE.test(spec)) bareImported.add(resolved.split("?")[0]);
    }
  }
  for (const bare of bareImported) {
    assert.ok(UNFINGERPRINTED.has(bare), `bare import of ${bare} must be listed in UNFINGERPRINTED`);
  }
});

test("HTML entry points fingerprint their script refs too", () => {
  for (const htmlFile of ["index.html", "404.html"]) {
    const html = readFileSync(path.join(PROJECT_ROOT, htmlFile), "utf8");
    const srcs = [...html.matchAll(/<script[^>]*\ssrc=["']([^"']+)["']/g)].map((m) => m[1]);
    for (const src of srcs) {
      if (/^https?:/.test(src)) continue; // vendored/vendor-adjacent external refs are out of scope
      const resolved = src.startsWith("/") ? src.slice(1) : src;
      if (!resolved.endsWith(".js")) continue;
      if (UNFINGERPRINTED.has(resolved.split("?")[0])) continue;
      assert.match(
        src,
        QUERY_RE,
        `${htmlFile} loads ${src} without a fingerprint — the browser could pair a cached bare entry with fingerprinted imports and double-instantiate modules`
      );
    }
  }
});
