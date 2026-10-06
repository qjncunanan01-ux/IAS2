// ============================================================================
// PRACTICE MODE — banner + simulated SQL console UI.
// ============================================================================
//
// Only reachable with ?lab=1 in the URL (see js/utils/lab.js). The banner is
// the visible half of the contract: if practice mode is on, the page says so,
// explains what is unsafe, and offers a way to turn it back off.
//
// The console renders everything through escapeHtml() — the injection it
// demonstrates happens in the *query string* (lab-sql.js), not in the DOM, so
// the two demos stay independent and ST-04's CSP story is untouched.

import { state } from "./state.js";
import { escapeHtml, escapeAttribute, refreshIcons, focusFirstFocusable } from "../utils/helpers.js?v=7bbd16f9";
import { showToast, showWarning } from "../components/toast.js?v=ce0cbc8e";
import { isLabEnabled, toggleLabEnabled, isLabRequested, initLabFromUrl } from "../utils/lab.js?v=8d55df8c";
import { runQuery, SAMPLE_PAYLOADS, TABLE_SCHEMAS } from "./lab-sql.js?v=f324aa97";
import { isAdmin } from "./auth.js?v=aec43a94";

let els = {};
let onToggle = () => {};
let consoleOpen = false;

/** Sinks this build deliberately stops escaping. Mirrored in the docs. */
export const LAB_SINKS = [
  "renderProductCard() — product name (stored XSS)",
  "createToastElement() — toast message (DOM XSS)",
  "renderShop() — search empty state (reflected XSS)",
  "runQuery() — SQL console (SQL injection)"
];

// ---------- banner ----------

function renderBanner() {
  if (!isLabRequested() || !els.labConsole) return;
  if (!els.labBanner) {
    els.labBanner = document.createElement("aside");
    els.labBanner.id = "labBanner";
    els.labBanner.className = "lab-banner";
    els.labBanner.setAttribute("role", "status");
    document.body.append(els.labBanner);
    els.labBanner.addEventListener("click", handleLabClick);
  }

  const on = isLabEnabled();
  els.labBanner.classList.toggle("is-off", !on);
  els.labBanner.innerHTML = `
    <div class="lab-banner-body">
      <i data-lucide="${on ? "shield-alert" : "shield-check"}"></i>
      <div>
        <strong>${on ? "Practice Mode — deliberate flaws ON" : "Practice Mode — flaws OFF"}</strong>
        <p>${
          on
            ? "Product names, toast messages and the search box skip escaping, and the simulated SQL console is unlocked. Teaching build — never use real data."
            : "The vulnerable render paths are inert again. This is the state real visitors get."
        }</p>
      </div>
    </div>
    <div class="lab-banner-actions">
      <button class="danger-button" type="button" data-action="lab-console">
        <i data-lucide="terminal"></i>
        SQL console
      </button>
      <button class="secondary-button" type="button" data-action="lab-toggle">
        ${on ? "Turn off" : "Turn on"}
      </button>
    </div>
  `;
  refreshIcons();
}

// ---------- console ----------

function optionsFor(table, selected) {
  return Object.values(TABLE_SCHEMAS)
    .map(
      (schema) =>
        `<option value="${escapeAttribute(schema.label)}"${schema.label === selected ? " selected" : ""}>${escapeHtml(schema.label)}</option>`
    )
    .join("");
}

export function openConsole() {
  if (!isLabEnabled()) {
    showWarning("Turn on Practice Mode first (load the page with ?lab=1).");
    return;
  }
  if (!els.labConsole) return;
  consoleOpen = true;
  const table = TABLE_SCHEMAS.items.label;
  els.labConsole.innerHTML = `
    <div class="modal-panel lab-panel" role="dialog" aria-modal="true" aria-labelledby="labConsoleTitle">
      <div class="modal-header">
        <div>
          <p class="eyebrow">Practice Mode</p>
          <h2 id="labConsoleTitle">Simulated SQL console</h2>
        </div>
        <button class="icon-button" type="button" data-action="lab-console-close" aria-label="Close SQL console">
          <i data-lucide="x"></i>
        </button>
      </div>

      <div class="alert-banner">
        <i data-lucide="flask-conical"></i>
        <p>
          <strong>Simulator, not a database.</strong> This app stores everything in
          localStorage. The console builds a real SQL string by concatenation and
          replays what each payload shape would do — it never executes SQL and
          never modifies your data.
        </p>
      </div>

      <form class="lab-query-form" id="labQueryForm">
        <div class="field">
          <label for="labTable">Table</label>
          <select id="labTable">${optionsFor(table, table)}</select>
        </div>
        <div class="field">
          <label for="labValue">Search value (goes straight into the statement)</label>
          <input id="labValue" name="value" type="text" autocomplete="off" placeholder="' OR '1'='1" />
        </div>
        <div class="lab-sample-row">
          ${SAMPLE_PAYLOADS.map(
            (sample) => `
              <button class="chip-button" type="button" data-action="lab-sample" data-id="${escapeAttribute(sample.id)}" title="${escapeAttribute(sample.payload)}">
                ${escapeHtml(sample.label)}
              </button>`
          ).join("")}
        </div>
        <button class="primary-button" type="submit">
          <i data-lucide="play"></i>
          Run vulnerable query
        </button>
        <button class="secondary-button" type="button" data-action="lab-parameterized">
          <i data-lucide="shield-check"></i>
          Run parameterised instead
        </button>
      </form>

      <div class="lab-results" id="labResults">
        <p class="lab-placeholder">Pick a payload and run the query.</p>
      </div>
    </div>
  `;
  els.labConsole.classList.remove("hidden");
  // The console carries its own Practice Mode warning, so the banner steps
  // aside instead of covering the form and its buttons.
  els.labBanner?.classList.add("hidden");
  els.labConsole.addEventListener("click", handleLabClick);
  els.labConsole.addEventListener("submit", handleLabSubmit);
  refreshIcons();
  focusFirstFocusable(els.labConsole);
}

export function closeConsole() {
  consoleOpen = false;
  if (!els.labConsole) return;
  els.labConsole.classList.add("hidden");
  els.labConsole.innerHTML = "";
  els.labConsole.removeEventListener("click", handleLabClick);
  els.labConsole.removeEventListener("submit", handleLabSubmit);
  els.labBanner?.classList.remove("hidden");
}

/** Console entry point: window.app.lab.runQuery(table, payload). */
export function runLabQuery(table = "items", value = "' OR '1'='1", parameterized = false) {
  const result = runQuery({
    table,
    value,
    parameterized,
    dataset: { items: state.items, users: state.users, orders: state.orders },
    isAdmin: isAdmin()
  });
  if (consoleOpen) paintResults(result);
  return result;
}

// ---------- rendering the result ----------

function renderTable(table) {
  return `
    <div class="lab-table-wrap">
      <p class="lab-table-title">${escapeHtml(table.title)}</p>
      <table class="data-table">
        <thead>
          <tr>${table.columns.map((column) => `<th>${escapeHtml(column)}</th>`).join("")}</tr>
        </thead>
        <tbody>
          ${
            table.rows.length
              ? table.rows
                  .map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`)
                  .join("")
              : `<tr><td class="lab-empty-cell" colspan="${table.columns.length}">no rows</td></tr>`
          }
        </tbody>
      </table>
    </div>
  `;
}

function paintResults(result) {
  const target = document.querySelector("#labResults");
  if (!target) return;
  target.innerHTML = `
    <div class="lab-sql-box">
      <p class="lab-table-title">
        ${result.mode === "parameterized" ? "Prepared statement" : "Vulnerable statement (string concatenation)"}
      </p>
      <code>${escapeHtml(result.sql)}</code>
      ${
        result.mode === "parameterized"
          ? ""
          : `<p class="lab-sql-note">Value used: <code>${escapeHtml(result.analysis.raw)}</code></p>`
      }
    </div>
    <ul class="lab-notes">
      ${result.notes.map((note) => `<li class="lab-note is-${escapeAttribute(note.level)}">${escapeHtml(note.text)}</li>`).join("")}
    </ul>
    ${result.tables.map(renderTable).join("")}
  `;
  refreshIcons();
}

// ---------- events ----------

function currentFormValues() {
  const table = document.querySelector("#labTable")?.value || "items";
  const value = document.querySelector("#labValue")?.value ?? "";
  return { table, value };
}

function handleLabSubmit(event) {
  if (event.target.id !== "labQueryForm") return;
  event.preventDefault();
  const { table, value } = currentFormValues();
  runLabQuery(table, value, false);
}

function handleLabClick(event) {
  const target = event.target.closest("[data-action]");
  if (!target) return;
  const { action, id } = target.dataset;

  if (action === "lab-toggle") {
    const nowOn = toggleLabEnabled();
    renderBanner();
    onToggle(nowOn);
    showToast(
      nowOn
        ? "Practice Mode ON — output is no longer escaped."
        : "Practice Mode OFF — output is escaped again.",
      nowOn ? "warning" : "success"
    );
    return;
  }
  if (action === "lab-console") {
    openConsole();
    return;
  }
  if (action === "lab-console-close") {
    closeConsole();
    return;
  }
  if (action === "lab-sample") {
    const sample = SAMPLE_PAYLOADS.find((entry) => entry.id === id);
    if (!sample) return;
    const input = document.querySelector("#labValue");
    if (input) input.value = sample.payload;
    const { table } = currentFormValues();
    runLabQuery(table, sample.payload, false);
    return;
  }
  if (action === "lab-parameterized") {
    const { table, value } = currentFormValues();
    runLabQuery(table, value, true);
  }
}

// ---------- init ----------

/**
 * @param {object} elements cached DOM nodes (needs labConsole)
 * @param {Function} rerender callback that re-renders the app after a toggle
 */
export function initLab(elements, rerender) {
  els = elements;
  if (typeof rerender === "function") onToggle = rerender;
  // Reads ?lab=1 from the URL. Absent flag => requested === false => no banner,
  // no console, and every sink stays escaped.
  initLabFromUrl();
  renderBanner();
}

export { renderBanner };
