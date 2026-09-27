// Tests for the asset fingerprinting build tool.
//
// The tool is exercised against a throwaway copy of the real project tree
// so the tests prove the actual import graph gets rewritten end to end:
// HTML refs, relative import specifiers, and the --check/--apply contract.

import assert from "node:assert/strict";
import { test } from "node:test";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildHashMap,
  collectTargets,
  computeShortHash,
  findRefs,
  rewriteSource,
  runApply,
  runCheck
} from "../tools/fingerprint.mjs";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function makeTempProject() {
  const root = mkdtempSync(path.join(tmpdir(), "ias2-fingerprint-"));
  cpSync(path.join(PROJECT_ROOT, "js"), path.join(root, "js"), { recursive: true });
  cpSync(path.join(PROJECT_ROOT, "assets"), path.join(root, "assets"), { recursive: true });
  cpSync(path.join(PROJECT_ROOT, "index.html"), path.join(root, "index.html"));
  cpSync(path.join(PROJECT_ROOT, "404.html"), path.join(root, "404.html"));
  cpSync(path.join(PROJECT_ROOT, "styles.css"), path.join(root, "styles.css"));
  return root;
}

test("computeShortHash is stable across CRLF/LF line endings", () => {
  const lf = "const a = 1;\nconst b = 2;\n";
  const crlf = "const a = 1;\r\nconst b = 2;\r\n";
  assert.equal(computeShortHash(lf), computeShortHash(crlf));
  assert.match(computeShortHash(lf), /^[0-9a-f]{8}$/);
  assert.notEqual(computeShortHash(lf), computeShortHash(lf + "x"));
});

test("findRefs picks up HTML script/stylesheet refs, local files only", () => {
  const html = `<link rel="stylesheet" href="styles.css">
<script defer src="assets/vendor/lucide.min.js"></script>
<script type="module" src="/js/main.js"></script>
<script src="https://cdn.example.net/x.js"></script>`;
  const refs = findRefs("index.html", html, PROJECT_ROOT).map((r) => r.ref);
  assert.ok(refs.includes("styles.css"));
  assert.ok(refs.includes("assets/vendor/lucide.min.js"));
  assert.ok(refs.includes("/js/main.js"));
  assert.ok(!refs.some((r) => r.includes("example.net")), "remote refs excluded");
});

test("findRefs picks up all import specifier styles in JS", () => {
  const js = `import { state } from "./state.js";
import "./side-effect.js";
const mod = await import("./lazy.js");
import { x } from '../utils/helpers.js';`;
  const refs = findRefs("js/main.js", js, PROJECT_ROOT).map((r) => r.ref);
  assert.deepEqual(refs.sort(), ["./lazy.js", "./side-effect.js", "./state.js", "../utils/helpers.js"].sort());
});

test("rewriteSource fingerprints HTML refs", () => {
  const html = `<link rel="stylesheet" href="styles.css" />
<script defer src="assets/vendor/lucide.min.js"></script>`;
  const { output, rewritten, missing } = rewriteSource(
    "index.html",
    html,
    buildHashMap(PROJECT_ROOT),
    PROJECT_ROOT
  );
  assert.equal(missing.length, 0);
  assert.equal(rewritten.length, 2);
  assert.match(output, /href="styles\.css\?v=[0-9a-f]{8}"/);
  assert.match(output, /src="assets\/vendor\/lucide\.min\.js\?v=[0-9a-f]{8}"/);
});

test("rewriteSource fingerprints deep import chains and keeps state.js bare", () => {
  // Positioned as js/modules/auth.js so specifiers mirror the real graph:
  // "./state.js" -> js/modules/state.js (exempt singleton),
  // "../utils/storage.js" -> js/utils/storage.js (fingerprinted).
  const js = `import { state } from "./state.js";
import { save } from "../utils/storage.js";`;
  const { output, rewritten, missing } = rewriteSource(
    "js/modules/auth.js",
    js,
    buildHashMap(PROJECT_ROOT),
    PROJECT_ROOT
  );
  assert.equal(missing.length, 0);
  assert.equal(rewritten.length, 1);
  assert.ok(output.includes(`from "./state.js"`), "singleton keeps bare identity");
  assert.match(output, /from "\.\.\/utils\/storage\.js\?v=[0-9a-f]{8}"/);
});

test("rewriteSource flags refs to files outside the hashed graph", () => {
  const { missing } = rewriteSource("index.html", '<script src="js/nope.js"></script>', buildHashMap(PROJECT_ROOT), PROJECT_ROOT);
  assert.deepEqual(missing, ["js/nope.js"]);
});

test("rewriteSource strips query strings from exempt singleton refs", () => {
  const js = `import { state } from "./state.js?v=00000000";`;
  const { output, rewritten, missing } = rewriteSource("js/modules/auth.js", js, buildHashMap(PROJECT_ROOT), PROJECT_ROOT);
  assert.equal(missing.length, 0);
  assert.equal(rewritten.length, 1);
  assert.ok(output.includes(`from "./state.js"`), "query stripped, bare specifier restored");
});

test("runCheck is green on a freshly applied tree and red after an edit", () => {
  const root = makeTempProject();
  try {
    runApply(root); // normalize the copy (committed tree may predate a tool fix)
    assert.equal(runCheck(root), 0, "check passes on current tree");

    // Edit a deep dependency: its hash changes, so every ref to it goes stale.
    const storage = path.join(root, "js", "utils", "storage.js");
    writeFileSync(storage, readFileSync(storage, "utf8").replace("export", "export /* touched */"), "utf8");
    assert.ok(runCheck(root) > 0, "check must fail after a dependency changes");

    // Exactly the files that import storage.js get their refs refreshed;
    // their own hashes do NOT change (hashes ignore embedded queries), so
    // there is no cascade beyond the direct importers.
    const storageImporters = collectTargets(root).filter((f) =>
      readFileSync(f, "utf8").includes("utils/storage.js")
    ).length;
    assert.equal(runApply(root), storageImporters, "only direct importers are rewritten");
    assert.equal(runCheck(root), 0, "check is green again after apply");
    assert.equal(runApply(root), 0, "no cascade: second apply is a no-op");

    // The rewritten specifier points at storage.js with the NEW hash; the
    // singleton stays bare so module identity is preserved. (auth.js imports
    // both storage.js and state.js, so it exercises both rules.)
    const auth = readFileSync(path.join(root, "js", "modules", "auth.js"), "utf8");
    const current = buildHashMap(root).get(storage); // canonical (stripped) hash
    assert.ok(/from "[^"]*state\.js"/.test(auth), "state.js stays bare (no query)");
    assert.ok(
      auth.includes(`../utils/storage.js?v=${current}`),
      "importer now references the fresh dependency hash"
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("apply is idempotent and updates stale ?v= values in place", () => {
  const root = makeTempProject();
  try {
    runApply(root); // normalize the copy
    const mainPath = path.join(root, "js", "main.js");
    // Forge a stale hash into one specifier, then let apply fix it.
    writeFileSync(mainPath, readFileSync(mainPath, "utf8").replace(/\?v=[0-9a-f]{8}/, "?v=00000000"), "utf8");
    assert.ok(runCheck(root) > 0);
    assert.equal(runApply(root), 1);
    assert.equal(runCheck(root), 0);
    assert.ok(!readFileSync(mainPath, "utf8").includes("00000000"), "stale hash replaced");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("404.html root-relative refs are fingerprinted too", () => {
  const { output } = rewriteSource(
    "404.html",
    readFileSync(path.join(PROJECT_ROOT, "404.html"), "utf8"),
    buildHashMap(PROJECT_ROOT),
    PROJECT_ROOT
  );
  assert.match(output, /href="\/styles\.css\?v=[0-9a-f]{8}"/);
});
