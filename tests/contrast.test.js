// Theme-token contrast regression tests — WCAG 2.1 SC 1.4.3 (text, 4.5:1)
// and 1.4.11 (focus indicator / non-text, 3:1).
//
// The accessibility pass made four fixes that were all invisible to CI:
// light --brand stepped to brand-700 (3.74 -> 5.47:1), dark --muted stepped
// to neutral-400 (4.18 -> 7.11:1), the dark cart-badge text was flipped to
// neutral-950 (2.69 -> 7.36:1 via a rule override — the badge's base color
// is a hardcoded #fff, not a token), and the focus ring was rebuilt so
// --focus-outline holds >=3:1 against page and element (1.26 -> 5.24+).
// A palette tweak in styles.css could silently undo every one of them.
//
// This file parses the REAL token blocks out of styles.css (comment-stripped,
// top-level `:root` merged for light, `[data-theme="dark"]` layered on top),
// resolves var() chains to hex, recomputes each ratio with the WCAG relative
// luminance formula, and asserts against the bars. The badge rules are
// parsed too, because that fix lives in CSS rules rather than tokens.
//
// Bars: 4.5:1 for every text pair, 3:1 for the focus indicator. Every
// current pair clears its bar with margin; every pre-fix value sat below
// it, so the matrix is neither vacuous nor stricter than WCAG.
// `--ink-tertiary` is deliberately excluded: defined but never consumed
// anywhere in styles.css.

import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CSS = readFileSync(path.join(PROJECT_ROOT, "styles.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

// Top-level rule blocks only. Media queries nest deeper, and a scan of the
// file confirms theme tokens are never redefined inside them — the sentinel
// assertions below fail loudly if that ever stops being true.
function topLevelRules() {
  const rules = [];
  let depth = 0;
  let selectorFrom = 0;
  let bodyFrom = -1;
  for (let i = 0; i < CSS.length; i++) {
    const ch = CSS[i];
    if (ch === "{") {
      if (depth === 0) {
        rules.push({ selector: CSS.slice(selectorFrom, i).trim(), body: null, bodyFrom: i + 1 });
        bodyFrom = i + 1;
      }
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0) {
        const last = rules[rules.length - 1];
        if (last && last.body === null && last.bodyFrom === bodyFrom) {
          last.body = CSS.slice(bodyFrom, i);
        }
        selectorFrom = i + 1;
      }
    }
  }
  return rules.filter((rule) => rule.body !== null);
}

function declarationsOf(body) {
  const map = new Map();
  for (const match of body.matchAll(/(--[\w-]+)\s*:\s*([^;{}]+);/g)) {
    map.set(match[1], match[2].trim());
  }
  return map;
}

function resolveVar(map, value) {
  let out = value;
  for (let guard = 0; out.includes("var(") && guard < 12; guard++) {
    out = out.replace(/var\(\s*(--[\w-]+)\s*(?:,\s*([^)]+))?\)/g, (_, name, fallback) => map.get(name) ?? fallback ?? "");
  }
  return out.trim();
}

function toHex(color) {
  const six = color.match(/^#([0-9a-f]{6})$/i);
  if (six) return six[1].toLowerCase();
  const three = color.match(/^#([0-9a-f]{3})$/i);
  if (three) return three[1].split("").map((c) => c + c).join("").toLowerCase();
  return null;
}

function luminance(hex) {
  const value = parseInt(hex, 16);
  const channels = [(value >> 16) & 255, (value >> 8) & 255, value & 255]
    .map((channel) => channel / 255)
    .map((channel) => (channel <= 0.04045 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4)));
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrastRatio(fgHex, bgHex) {
  const [lighter, darker] = [luminance(fgHex), luminance(bgHex)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

const rules = topLevelRules();
const lightTokens = new Map();
const darkTokens = new Map();
for (const rule of rules) {
  if (rule.selector === ":root") {
    for (const [key, value] of declarationsOf(rule.body)) lightTokens.set(key, value);
  }
}
for (const [key, value] of lightTokens) darkTokens.set(key, value);
for (const rule of rules) {
  if (rule.selector === '[data-theme="dark"]') {
    for (const [key, value] of declarationsOf(rule.body)) darkTokens.set(key, value);
  }
}

function ratioOf(theme, fgToken, bgToken) {
  const fg = toHex(resolveVar(theme, `var(--${fgToken})`));
  const bg = toHex(resolveVar(theme, `var(--${bgToken})`));
  assert.ok(fg && bg, `unresolvable token pair: --${fgToken} on --${bgToken} (${fg} / ${bg})`);
  return contrastRatio(fg, bg);
}

const TEXT_BAR = 4.5;   // WCAG 2.1 SC 1.4.3
const NON_TEXT_BAR = 3; // WCAG 2.1 SC 1.4.11 (focus indicator)

// Core text surfaces + the pairs the accessibility pass touched.
const TEXT_PAIRS = [
  ["ink", "surface"],
  ["ink", "bg"],
  ["ink-secondary", "surface"],
  ["muted", "surface"],
  ["muted", "surface-strong"],
  ["muted", "bg"],
  ["brand-foreground", "brand"],
  ["brand", "surface"],
  ["brand", "bg"],
  ["coral-foreground", "coral"],
  ["danger-foreground", "danger"],
  ["accent-foreground", "accent"],
  ["status-paid-ink", "status-paid-bg"],
  ["status-processing-ink", "status-processing-bg"],
  ["chip-warning-ink", "chip-warning-bg"]
];

// The dual ring paints --focus-outline against the page and against the gap
// layer (surface in light, surface-strong in dark) — all three must hold 3:1.
const FOCUS_PAIRS = [
  ["focus-outline", "surface"],
  ["focus-outline", "surface-strong"],
  ["focus-outline", "bg"]
];

function matrixFailures(theme, bar, pairs) {
  const failures = [];
  for (const [fg, bg] of pairs) {
    const ratio = ratioOf(theme, fg, bg);
    if (ratio < bar) {
      failures.push(`--${fg} on --${bg}: ${ratio.toFixed(2)}:1 (needs >= ${bar})`);
    }
  }
  return failures;
}

test("light theme tokens clear their WCAG bars", () => {
  assert.ok(lightTokens.size >= 80, `parsed only ${lightTokens.size} light tokens — styles.css parse is broken`);
  const failures = [
    ...matrixFailures(lightTokens, TEXT_BAR, TEXT_PAIRS),
    ...matrixFailures(lightTokens, NON_TEXT_BAR, FOCUS_PAIRS)
  ];
  assert.deepEqual(failures, [], `light palette regressions:\n  ${failures.join("\n  ")}`);
});

test("dark theme tokens clear their WCAG bars", () => {
  assert.ok(darkTokens.size >= 100, `parsed only ${darkTokens.size} dark tokens — styles.css parse is broken`);
  // The specific fixes this file exists to lock:
  assert.ok(
    ratioOf(darkTokens, "muted", "surface") >= TEXT_BAR,
    "dark --muted regressed below 4.5:1 (was neutral-500 at 4.18:1 before the fix)"
  );
  const failures = [
    ...matrixFailures(darkTokens, TEXT_BAR, TEXT_PAIRS),
    ...matrixFailures(darkTokens, NON_TEXT_BAR, FOCUS_PAIRS)
  ];
  assert.deepEqual(failures, [], `dark palette regressions:\n  ${failures.join("\n  ")}`);
});

test("badge override and focus wiring stay in place (rule-level fixes)", () => {
  // 1. The badge's BASE rule: hardcoded #fff text on var(--coral). Light
  //    contrast comes from the token pair — but only while the background
  //    is still --coral and the text still #fff.
  const baseRule = CSS.match(/\.cart-button strong \{[^}]*\}/);
  assert.ok(baseRule, ".cart-button strong rule missing from styles.css");
  assert.match(baseRule[0], /background:\s*var\(--coral\)/, "badge background no longer tracks --coral; the token pair no longer models the badge");
  const baseColor = baseRule[0].match(/color:\s*([^;]+);/);
  assert.ok(baseColor, "badge base text color missing");

  // 2. THE fix for dark mode: without this override the light #fff on light
  //    coral drops to 2.69:1. It is a rule, not a token, so the matrix
  //    above cannot see its removal — assert it explicitly.
  const darkOverride = CSS.match(/\[data-theme="dark"\]\s+\.cart-button\s+strong\s*\{\s*color:\s*([^;]+);/);
  assert.ok(
    darkOverride,
    "[data-theme=\"dark\"] .cart-button strong { color: … } override is gone — dark badge falls back to #fff on coral = 2.69:1"
  );

  const lightCoral = toHex(resolveVar(lightTokens, "var(--coral)"));
  const darkCoral = toHex(resolveVar(darkTokens, "var(--coral)"));
  const lightBadgeText = toHex(resolveVar(lightTokens, baseColor[1].trim()));
  const darkBadgeText = toHex(resolveVar(darkTokens, darkOverride[1].trim()));
  assert.ok(lightCoral && darkCoral && lightBadgeText && darkBadgeText, "badge colors failed to resolve");
  const lightBadge = contrastRatio(lightBadgeText, lightCoral);
  const darkBadge = contrastRatio(darkBadgeText, darkCoral);
  assert.ok(lightBadge >= TEXT_BAR, `light badge ${lightBadge.toFixed(2)}:1 < ${TEXT_BAR}`);
  assert.ok(darkBadge >= TEXT_BAR, `dark badge ${darkBadge.toFixed(2)}:1 < ${TEXT_BAR}`);

  // 3. Focus wiring: :focus-visible must still paint the token outline AND
  //    the dual ring, and both themes must still define the ring (with the
  //    correct gap layer — surface in light, surface-strong in dark).
  const focusRule = CSS.match(/:focus-visible \{[^}]*\}/);
  assert.ok(focusRule, ":focus-visible rule missing");
  assert.match(focusRule[0], /outline:\s*2px solid var\(--focus-outline\)/, "focus outline no longer uses --focus-outline");
  assert.match(focusRule[0], /box-shadow:\s*var\(--focus-ring\)/, "focus rule no longer uses the dual --focus-ring");
  // Structure check on the RAW token values (resolveVar substitutes the
  // var() calls away, and structure is what this assertion is about):
  // the ring must keep both layers — a surface gap, then the outline.
  const lightRing = lightTokens.get("--focus-ring") || "";
  const darkRing = darkTokens.get("--focus-ring") || "";
  for (const [themeName, ring] of [["light", lightRing], ["dark", darkRing]]) {
    assert.match(ring, /0 0 0 2px var\(--surface(?:-strong)?\)/, `${themeName} focus ring lost its surface gap layer`);
    assert.match(ring, /0 0 0 4px var\(--focus-outline\)/, `${themeName} focus ring lost its outline layer`);
  }
  assert.ok(toHex(resolveVar(lightTokens, "var(--focus-outline)")), "light --focus-outline no longer resolves to a hex");
  assert.ok(toHex(resolveVar(darkTokens, "var(--focus-outline)")), "dark --focus-outline no longer resolves to a hex");
});
