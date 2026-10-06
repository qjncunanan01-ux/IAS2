// Practice Mode regression tests.
//
// Two things must never silently drift:
//
//  1. The default build stays secure. Without the URL flag the lab is off,
//     `labUnsafeText()` is exactly `escapeHtml()`, and every vulnerable code
//     path is unreachable. That is the promise the live site makes to real
//     visitors, so it is asserted here rather than trusted.
//  2. The teaching demos still do what the write-up claims they do — the
//     tautology leaks rows, the UNION pulls another table, the prepared
//     statement refuses both.

import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { detectLabFlag, isLabEnabled, isLabRequested, setLabEnabled, toggleLabEnabled, initLabFromUrl, labUnsafeText } from "../js/utils/lab.js";
import { analyzePayload, buildVulnerableSql, buildParameterizedSql, runQuery, TABLE_SCHEMAS, SAMPLE_PAYLOADS } from "../js/modules/lab-sql.js";
import { escapeHtml } from "../js/utils/helpers.js";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// ---------- the gate ----------

test("practice mode is off unless the URL asks for it", () => {
  assert.equal(detectLabFlag(""), false);
  assert.equal(detectLabFlag("?"), false);
  assert.equal(detectLabFlag("?page=2"), false);
  assert.equal(detectLabFlag("?lab=0"), false);
  assert.equal(detectLabFlag("?lab=false"), false);
  assert.equal(detectLabFlag("?lab=nope"), false);
  assert.equal(detectLabFlag("?enablelab=1"), false, "key must match exactly");
  assert.equal(detectLabFlag("?LAB=1"), false, "the key is case-sensitive");
});

test("practice mode unlocks on ?lab=1 and its aliases", () => {
  assert.equal(detectLabFlag("?lab=1"), true);
  assert.equal(detectLabFlag("lab=1"), true);
  assert.equal(detectLabFlag("?page=2&lab=1&sort=priceLow"), true);
  assert.equal(detectLabFlag("?lab=true"), true);
  assert.equal(detectLabFlag("?lab=ON"), true);
  assert.equal(detectLabFlag("?lab=%201%20"), true, "whitespace is trimmed");
});

test("a fresh module instance starts disabled and unrequested", () => {
  assert.equal(isLabEnabled(), false);
  assert.equal(isLabRequested(), false);
  assert.equal(labUnsafeText("<b>x</b>"), escapeHtml("<b>x</b>"));
});

test("initLabFromUrl reads the flag and remembers the request", () => {
  assert.equal(initLabFromUrl("?lab=1"), true);
  assert.equal(isLabEnabled(), true);
  assert.equal(isLabRequested(), true);

  assert.equal(initLabFromUrl("?page=2"), false);
  assert.equal(isLabEnabled(), false);
  assert.equal(isLabRequested(), false, "a normal URL never requests the lab");
});

test("turning practice mode off restores escaping and keeps the banner available", () => {
  initLabFromUrl("?lab=1");
  assert.equal(isLabEnabled(), true);
  assert.equal(labUnsafeText("<img src=x>"), "<img src=x>", "raw in practice mode");

  setLabEnabled(false);
  assert.equal(isLabEnabled(), false);
  assert.equal(isLabRequested(), true, "still reachable via the banner toggle");
  assert.equal(labUnsafeText("<img src=x>"), escapeHtml("<img src=x>"));

  assert.equal(toggleLabEnabled(), true);
  assert.equal(toggleLabEnabled(), false);
  initLabFromUrl("");
});

// ---------- every unsafe render path is behind the gate ----------

test("the deliberate escaping bypass has one implementation and two call sites", () => {
  const jsFiles = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".js")) jsFiles.push(full);
    }
  };
  walk(path.join(PROJECT_ROOT, "js"));

  const definitions = [];
  const callSites = [];
  for (const file of jsFiles) {
    const rel = path.relative(PROJECT_ROOT, file).split(path.sep).join("/");
    const source = readFileSync(file, "utf8");
    for (const line of source.split("\n")) {
      if (/export function labUnsafeText/.test(line)) definitions.push(rel);
      // A call site is an invocation outside the defining module — its own
      // body and doc comments are not sinks.
      if (/labUnsafeText\(/.test(line) && rel !== "js/utils/lab.js") callSites.push(rel);
    }
  }

  assert.deepEqual(definitions, ["js/utils/lab.js"], "the bypass must stay in one auditable place");
  assert.deepEqual(
    [...callSites].sort(),
    ["js/components/render-helpers.js", "js/components/toast.js"],
    "sink inventory changed — update LAB_SINKS and SECURITY-TESTING.md to match"
  );
});

test("the vulnerable render paths call the shared lab gate", () => {
  const stripComments = (source) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const helper = stripComments(readFileSync(path.join(PROJECT_ROOT, "js/components/render-helpers.js"), "utf8"));
  const toast = stripComments(readFileSync(path.join(PROJECT_ROOT, "js/components/toast.js"), "utf8"));
  const ui = stripComments(readFileSync(path.join(PROJECT_ROOT, "js/modules/ui.js"), "utf8"));

  assert.match(helper, /<h3>\$\{labUnsafeText\(item\.name\)\}<\/h3>/, "product name sink");
  assert.match(helper, /raw && isLabEnabled\(\)/, "empty-state copy gate");
  assert.match(toast, /<span>\$\{labUnsafeText\(message\)\}<\/span>/, "toast sink");
  assert.match(ui, /renderEmptyState\([\s\S]*?isLabEnabled\(\)\s*\n\s*\)/, "search empty-state gate");
});

// ---------- payload analysis ----------

test("analyzePayload recognizes the classic shapes", () => {
  assert.equal(analyzePayload("Aura Desk Lamp").injected, false);

  assert.deepEqual(analyzePayload("' OR '1'='1").techniques, ["tautology"]);
  assert.deepEqual(analyzePayload("' or 1=1 --").techniques, ["tautology", "comment-truncation"]);
  assert.deepEqual(analyzePayload("' or ''='").techniques, ["tautology"]);
  assert.equal(analyzePayload("Fork or Knife").injected, false, "the word or is not an injection");

  const union = analyzePayload("' UNION SELECT id, name, email, role, password FROM users --");
  assert.equal(union.unionTable, "users");
  assert.ok(union.techniques.includes("union"));
  assert.ok(union.techniques.includes("comment-truncation"));

  assert.equal(analyzePayload("'; DROP TABLE items; --").stacked, "DROP (simulated)");
  assert.equal(analyzePayload("'; DELETE FROM users WHERE '1'='1").stacked, "DELETE (simulated)");
  assert.equal(analyzePayload("' OR SLEEP(5) --").blindTime, true);

  const unknown = analyzePayload("' UNION SELECT id FROM secrets --");
  assert.equal(unknown.unionTable, null);
  assert.equal(unknown.unknownUnionTable, "secrets");
});

test("analyzePayload tolerates junk input", () => {
  for (const value of ["", null, undefined, 0, "   "]) {
    const analysis = analyzePayload(value);
    assert.equal(analysis.injected, false);
    assert.equal(typeof analysis.raw, "string");
  }
});

test("every bundled sample payload is classified as an injection", () => {
  assert.ok(SAMPLE_PAYLOADS.length >= 4);
  for (const sample of SAMPLE_PAYLOADS) {
    assert.ok(sample.label && sample.expect, "samples document themselves for the report");
    assert.equal(
      analyzePayload(sample.payload).injected,
      true,
      `sample "${sample.id}" no longer parses as an injection`
    );
  }
});

// ---------- query building ----------

test("the vulnerable statement concatenates the payload, the fix does not", () => {
  const payload = "' OR '1'='1";
  const vulnerable = buildVulnerableSql("items", "name", payload);
  assert.match(vulnerable, /WHERE name = '\$?'? OR '1'='1'/);
  assert.ok(vulnerable.includes(payload), "payload visible in the SQL: that is the bug");

  const safe = buildParameterizedSql("items", "name");
  assert.ok(!safe.includes(payload));
  assert.match(safe, /WHERE name = \?$/);
});

// ---------- execution (simulated) ----------

const dataset = {
  items: [
    { id: "item_lamp", name: "Aura Desk Lamp", category: "Workspace", price: 1290, stock: 16, active: true },
    { id: "item_mouse", name: "Glide Ergo Mouse", category: "Computer", price: 980, stock: 22, active: true },
    { id: "item_watch", name: "Stride Smart Watch", category: "Wearables", price: 1890, stock: 19, active: true }
  ],
  users: [
    { id: "user_admin", name: "Admin User", email: "admin@ias2.test", role: "admin", password: "sha256$abcd" },
    { id: "user_demo", name: "Demo Customer", email: "user@ias2.test", role: "user", password: "sha256$ef01" }
  ],
  orders: []
};

const run = (overrides) =>
  runQuery({ table: "items", value: "", parameterized: false, dataset, isAdmin: false, ...overrides });

test("a normal lookup only returns matching rows", () => {
  const result = run({ value: "lamp" });
  assert.equal(result.ok, true);
  assert.equal(result.tables.length, 1);
  assert.deepEqual(result.tables[0].rows.map((row) => row[1]), ["Aura Desk Lamp"]);
});

test("a tautology leaks every row of the table", () => {
  const result = run({ value: "' OR '1'='1" });
  assert.equal(result.tables[0].rows.length, dataset.items.length);
  assert.match(result.tables[0].title, /leaked/);
  assert.ok(result.notes.some((note) => note.level === "danger" && /always true/.test(note.text)));
});

test("UNION SELECT appends another table to the result set", () => {
  const result = run({ value: "' UNION SELECT id, name, email, role, password FROM users --", isAdmin: true });
  assert.equal(result.tables.length, 2);
  assert.match(result.tables[1].title, /^users · 2 rows \(appended by UNION\)$/);
  assert.deepEqual(result.tables[1].columns, TABLE_SCHEMAS.users.columns);
  assert.ok(result.tables[1].rows.some((row) => row[4] === "sha256$abcd"), "the hash column leaks too");
});

test("a non-admin session cannot exfiltrate the users table by injection", () => {
  const result = run({ value: "' UNION SELECT id, name, email, role, password FROM users --" });
  assert.equal(result.tables.length, 1, "no appended table");
  assert.ok(result.notes.some((note) => /blocked/.test(note.text)));
});

test("the users table itself is admin-only on the vulnerable path", () => {
  assert.equal(run({ table: "users", value: "a", isAdmin: false }).ok, false);
  assert.equal(run({ table: "users", value: "a", isAdmin: true }).ok, true);
});

test("a stacked DROP is reported and changes nothing", () => {
  const result = run({ value: "'; DROP TABLE items; --" });
  assert.equal(result.ok, true);
  assert.deepEqual(result.tables, []);
  assert.ok(result.notes.some((note) => /Stacked statement detected/.test(note.text)));
  assert.equal(dataset.items.length, 3, "the simulator never mutates data");
});

test("the prepared statement refuses the same payload that leaked the table", () => {
  const payload = "' OR '1'='1";
  const vulnerable = run({ value: payload });
  const prepared = run({ value: payload, parameterized: true });

  assert.ok(vulnerable.tables[0].rows.length > 1);
  assert.equal(prepared.tables[0].rows.length, 0, "matched literally, so no rows");
  assert.ok(prepared.notes.some((note) => note.level === "safe" && /injection failed/.test(note.text)));
});

test("an unknown table is rejected instead of throwing", () => {
  const result = runQuery({ table: "secrets", value: "x", dataset });
  assert.equal(result.ok, false);
  assert.match(result.error, /Unknown table/);
});
