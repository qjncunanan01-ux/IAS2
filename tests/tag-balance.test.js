// Missing-closing-tag regression guard.
//
// Background: commit 61e5c8c shipped a renderHero() whose template literal
// lacked its closing </section>. The browser "repaired" the HTML by absorbing
// the product grid into the hero banner (6,780px hero, 1-column grid) and the
// broken build sat on the deployed site until a manual audit caught it. One
// forgotten end tag in one template is exactly the class of bug a machine can
// check on every run, so this test checks it:
//
//   * index.html / 404.html as raw HTML;
//   * every template literal in js/** — recursing into nested templates
//     inside ${...} holes, because render helpers build HTML that way.
//
// Test 2 feeds the checker known-bad fragments so the guard itself can never
// silently go vacuous (a tokenizer that stopped matching would "pass" every
// file while guarding nothing).
//
// Scope: only shipped code. The deploy package is index.html, styles.css,
// js/, assets/ (README → Deployment), and strings under tests/ are test
// inputs, not rendered markup — e.g. the escape payload
// `He said "it's" & <done>` in helpers.test.js is deliberately out of scope.
//
// Known limit: a regex literal containing an unbalanced quote (/[<>&"']/)
// can make the top-level tokenizer skip ahead, at worst hiding a fragment
// from the scan. The ported scanner has run against this codebase before and
// surfaced zero findings in js/, so the limit is theoretical here; if this
// test ever misses a real bug, that is the first place to look.

import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HTML_FILES = ["index.html", "404.html"];

// Elements with no end tag, and end tags the HTML spec allows to omit
// (browsers close them implicitly) — legal HTML, not layout bugs.
const VOID = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input", "link",
  "meta", "param", "source", "track", "wbr"
]);
const OPTIONAL_END = new Set([
  "p", "li", "dt", "dd", "td", "th", "tr", "thead", "tbody", "tfoot",
  "option", "optgroup", "colgroup", "caption", "rb", "rt", "rtc", "rp"
]);

function lineOf(src, idx) {
  let line = 1;
  for (let i = 0; i < idx && i < src.length; i++) if (src[i] === "\n") line++;
  return line;
}

function countNewlines(s) {
  let n = 0;
  for (let i = 0; i < s.length; i++) if (s[i] === "\n") n++;
  return n;
}

// --- template-literal extraction -------------------------------------------
// Walks a JS source and collects every template-literal text segment (holes
// removed, newlines preserved so reported line numbers stay accurate).
// Nested templates inside ${...} are collected too, at any depth.

// Returns the index of the `}` closing the `${` whose `{` is at `open`,
// skipping quoted strings and recursing through nested templates (collecting
// their segments into `out`).
function matchBrace(src, open, out) {
  let depth = 0;
  let i = open;
  while (i < src.length) {
    const c = src[i];
    if (c === "\\") { i += 2; continue; }
    if (c === "'" || c === '"') {
      const q = c;
      i++;
      while (i < src.length && src[i] !== q) { if (src[i] === "\\") i++; i++; }
      i++;
      continue;
    }
    if (c === "`") { i = scanTemplate(src, i, out); continue; }
    if (c === "{") depth++;
    else if (c === "}") { depth--; if (depth === 0) return i; }
    i++;
  }
  return -1;
}

// Scans a template literal starting at `i` (the backtick). Pushes its raw
// text segments (holes replaced by whitespace/newlines) into `out` and
// returns the index just past the closing backtick.
function scanTemplate(src, i, out) {
  let text = "";
  let j = i + 1;
  while (j < src.length) {
    const c = src[j];
    if (c === "\\") { text += c + (src[j + 1] ?? ""); j += 2; continue; }
    if (c === "`") { out.push({ text, idx: i }); return j + 1; }
    if (c === "$" && src[j + 1] === "{") {
      const hole = src.slice(j + 1, matchBrace(src, j + 1, out) + 1);
      text += hole.length > 1 ? "\n".repeat(countNewlines(hole)) || " " : " ";
      j += hole.length;
      continue;
    }
    text += c;
    j++;
  }
  out.push({ text, idx: i });
  return j;
}

function extractTemplateTexts(source) {
  const segments = [];
  let i = 0;
  while (i < source.length) {
    const c = source[i];
    if (c === "\\") { i += 2; continue; }
    if (c === "'" || c === '"') {
      const q = c;
      i++;
      while (i < source.length && source[i] !== q) { if (source[i] === "\\") i++; i++; }
      i++;
      continue;
    }
    if (c === "`") { i = scanTemplate(source, i, segments); continue; }
    if (c === "/" && source[i + 1] === "/") {
      while (i < source.length && source[i] !== "\n") i++;
      continue;
    }
    if (c === "/" && source[i + 1] === "*") {
      const end = source.indexOf("*/", i + 2);
      i = end === -1 ? source.length : end + 2;
      continue;
    }
    i++;
  }
  return segments;
}

// --- tag balance ------------------------------------------------------------

// Returns a list of findings for one HTML fragment. `baseLine` is the line
// the fragment starts on, so findings come back as absolute line numbers.
function checkHtml(fragment, baseLine) {
  const findings = [];
  const stripped = fragment.replace(/<!--[\s\S]*?-->/g, (m) => " ".repeat(m.length));
  const stack = [];
  const tagRe = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)([^>]*?)(\/?)>/g;
  const relative = (idx) => baseLine + countNewlines(stripped.slice(0, idx));
  let m;
  while ((m = tagRe.exec(stripped))) {
    const slash = m[1];
    const name = m[2].toLowerCase();
    const selfClose = m[4];
    if (!slash) {
      if (VOID.has(name) || selfClose) continue;
      stack.push({ name, line: relative(m.index) });
    } else {
      if (!stack.length) {
        findings.push(`line ${relative(m.index)}: </${name}> has no open element`);
        break;
      }
      const top = stack[stack.length - 1];
      if (top.name === name) { stack.pop(); continue; }
      // A spec-legal omitted end tag (e.g. </tr> closing implicit <td>s).
      if (OPTIONAL_END.has(top.name)) {
        let idx = stack.length - 1;
        while (idx >= 0 && OPTIONAL_END.has(stack[idx].name) && stack[idx].name !== name) idx--;
        if (idx >= 0 && stack[idx].name === name) { stack.length = idx; continue; }
      }
      findings.push(
        `line ${relative(m.index)}: </${name}> closes <${top.name}> (opened line ${top.line})`
      );
      break; // report the real cause once instead of cascading
    }
  }
  for (const open of stack) {
    findings.push(`line ${open.line}: <${open.name}> is never closed in this fragment`);
  }
  return findings;
}

function findJsFiles(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) findJsFiles(full, out);
    else if (entry.name.endsWith(".js")) out.push(full);
  }
  return out;
}

function scanAppMarkup() {
  const findings = [];

  for (const rel of HTML_FILES) {
    const src = readFileSync(path.join(PROJECT_ROOT, rel), "utf8");
    for (const f of checkHtml(src, 1)) findings.push(`${rel}: ${f}`);
  }

  for (const abs of findJsFiles(path.join(PROJECT_ROOT, "js"))) {
    const rel = path.relative(PROJECT_ROOT, abs).replaceAll("\\", "/");
    const src = readFileSync(abs, "utf8");
    for (const seg of extractTemplateTexts(src)) {
      for (const f of checkHtml(seg.text, lineOf(src, seg.idx))) {
        findings.push(`${rel}: ${f}`);
      }
    }
  }
  return findings;
}

// --- tests ------------------------------------------------------------------

test("every shipped HTML fragment balances its tags", () => {
  const findings = scanAppMarkup();
  assert.equal(
    findings.length,
    0,
    "Unbalanced HTML in shipped markup — a missing/mismatched closing tag " +
    "will make the browser absorb sibling elements (the renderHero bug):\n" +
    findings.map((f) => `  ${f}`).join("\n")
  );
});

test("the tag-balance checker detects broken fragments (non-vacuous)", () => {
  const broken = [
    ["missing </section> (the renderHero shape)", `<section class="hero"><div class="hero-copy"><p>x</p></div>`],
    ["mismatched end tag", `<div class="a"><span>x</div>`],
    ["end tag with no open element", `</div>`]
  ];
  for (const [name, html] of broken) {
    const found = checkHtml(html, 1);
    assert.ok(found.length > 0, `checker missed: ${name}`);
  }

  const legal = [
    ["void and self-closing elements", `<img src="x" /><br><hr/>`],
    ["spec-legal omitted end tags", `<tr><td>a<td>b</tr>`],
    ["fully balanced", `<section><figure><img src="y"></figure></section>`],
    ["HTML comments containing tags", `<!-- <div> commented out --><p>ok</p>`]
  ];
  for (const [name, html] of legal) {
    assert.deepEqual(checkHtml(html, 1), [], `checker false-positive: ${name}`);
  }

  // Nested templates inside ${...} holes are collected too.
  const src = [
    `const a = \`<div>\${cond ? \`<span>x</span>\` : ""}</div>\`;`,
    `const b = \`<section><p>oops</p>\`;`
  ].join("\n");
  const findings = extractTemplateTexts(src).flatMap((seg) =>
    checkHtml(seg.text, lineOf(src, seg.idx)).map((f) => f)
  );
  assert.equal(findings.length, 1, `expected exactly the line-2 defect, got: ${findings.join("; ")}`);
  assert.match(findings[0], /^line 2: <section> is never closed/, "finding must point at the broken template");
});
