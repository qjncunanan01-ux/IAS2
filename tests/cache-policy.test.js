// Guards the cache-policy contract between .htaccess and the fingerprint tool.
//
// Files listed in UNFINGERPRINTED (js/modules/state.js) are referenced bare,
// so they MUST be excluded from the immutable JS cache rule — otherwise a
// deploy that changes state.js would be invisible to returning browsers for
// a year. This codifies the fix for exactly that misconfiguration.

import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { UNFINGERPRINTED } from "../tools/fingerprint.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function rulesFor(htaccess, basename) {
  const rules = [];
  const pattern = /<FilesMatch\s+"([^"]+)">\s*\n\s*Header set Cache-Control\s+"([^"]+)"/g;
  let m;
  while ((m = pattern.exec(htaccess)) !== null) rules.push({ match: m[1], cache: m[2] });
  const applies = (rule) => {
    const source = rule.match.replace(/\\\\/g, "\\").replace(/\./g, "\\.").replace(/\^/, "^");
    // .htaccess FilesMatch is unanchored PCRE; convert the JS-ish glob we
    // wrote into a regex and test the basename against it.
    let re;
    try {
      re = new RegExp(rule.match);
    } catch {
      return false;
    }
    return re.test(basename);
  };
  const hits = rules.filter(applies);
  // Later FilesMatch blocks override earlier ones, mirroring Apache.
  return hits.length ? hits[hits.length - 1].cache : null;
}

test("state.js is excluded from immutable caching in .htaccess", () => {
  const htaccess = readFileSync(path.join(ROOT, ".htaccess"), "utf8");
  const cache = rulesFor(htaccess, "state.js");
  assert.ok(cache, "a FilesMatch rule should match state.js");
  assert.match(cache, /no-cache/, "state.js must be no-cache, not immutable");
});

test("regular fingerprinted JS keeps the immutable policy", () => {
  const htaccess = readFileSync(path.join(ROOT, ".htaccess"), "utf8");
  const cache = rulesFor(htaccess, "main.js");
  assert.match(cache, /immutable/);
});

test("every unfingerprinted module is covered by the no-cache exception", () => {
  const htaccess = readFileSync(path.join(ROOT, ".htaccess"), "utf8");
  for (const rel of UNFINGERPRINTED) {
    const basename = path.basename(rel);
    const cache = rulesFor(htaccess, basename);
    assert.match(cache, /no-cache/, `${rel} must be served no-cache`);
  }
});

test("no-cache exception rule appears after the immutable rule", () => {
  const htaccess = readFileSync(path.join(ROOT, ".htaccess"), "utf8");
  const immutableAt = htaccess.indexOf("31536000");
  const exceptionAt = htaccess.indexOf("^state\\.js$");
  assert.ok(immutableAt !== -1, "immutable rule should exist");
  assert.ok(exceptionAt > immutableAt, "exception must come later to win");
});

test("doc claims about state.js caching match the actual policy", () => {
  const readme = readFileSync(path.join(ROOT, "README.md"), "utf8");
  const runbook = readFileSync(path.join(ROOT, "DEPLOYMENT.md"), "utf8");
  for (const [name, doc] of [["README.md", readme], ["DEPLOYMENT.md", runbook]]) {
    assert.ok(doc.includes("state.js"), `${name} should mention the state.js exception`);
    assert.match(doc, /no-cache/, `${name} should document the no-cache policy`);
  }
});
