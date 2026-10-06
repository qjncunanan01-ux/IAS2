// ============================================================================
// PRACTICE MODE — a SIMULATED SQL engine that is injectable on purpose.
// ============================================================================
//
// There is no database in this app (state lives in localStorage), so this
// module *simulates* one to make the injection class visible. It is NOT a SQL
// parser. What it does:
//
//   1. Builds the query string the vulnerable code would send — by literally
//      concatenating the user's input, so the payload is visible in the SQL
//      that gets shown on screen.
//   2. Recognizes the handful of payload shapes a class demo needs
//      (tautology / UNION exfiltration / stacked statement / time-based blind)
//      and replays the EFFECT that shape would have on a real database:
//      `OR '1'='1` returns every row, `UNION SELECT … FROM users` hands over
//      another table, `; DROP TABLE …` is reported and nothing is touched.
//
// Nothing here executes SQL and nothing here mutates state: a "destructive"
// payload only produces a warning string. That is deliberate — the demo must
// be safe to click in front of a class.
//
// The lab never renders raw payload text into HTML; callers escape with
// escapeHtml(). The injection in this file is a *query-string* injection, not
// a DOM one, and the two demos stay independent on purpose.

/** Table definitions the console exposes. `key` is the searchable column. */
export const TABLE_SCHEMAS = {
  items: {
    label: "items",
    key: "name",
    columns: ["id", "name", "category", "price", "stock", "active"]
  },
  users: {
    label: "users",
    key: "name",
    columns: ["id", "name", "email", "role", "password"]
  },
  orders: {
    label: "orders",
    key: "customerName",
    columns: ["id", "customerName", "status", "total"]
  }
};

/** Tables that are never shown to a non-admin, mirrors the real UI rules. */
export const ADMIN_ONLY_TABLES = ["users"];

// ---------- payload analysis ----------

// `' OR '1'='1` ends with an *unterminated* literal — the quote that opens the
// comparison closes the injected string — so both quotes are optional here.
const TAUTOLOGY = /\bor\s+'?[\w.]*'?\s*=\s*'?[\w.]*'?/i;
const COMMENT = /--|\/\*|\*\//;
const STACKED = /;\s*(drop|delete|update|insert|alter|truncate)\b/i;
const UNION = /\bunion\s+(?:all\s+)?select\b[\s\S]*?\bfrom\s+["'`\[]?([a-z_][a-z0-9_]*)/i;
const BLIND_TIME = /\b(sleep|benchmark|pg_sleep|waitfor\s+delay)\s*\(/i;

/**
 * Classify an injected value. Pure and side-effect free.
 * @param {string} value raw user input
 */
export function analyzePayload(value) {
  const raw = String(value ?? "");
  const stackedMatch = raw.match(STACKED);
  const unionMatch = raw.match(UNION);
  const unionTable = unionMatch ? unionMatch[1].toLowerCase() : null;

  const techniques = [];
  if (TAUTOLOGY.test(raw)) techniques.push("tautology");
  if (unionTable) techniques.push("union");
  if (stackedMatch) techniques.push("stacked-statement");
  if (BLIND_TIME.test(raw)) techniques.push("time-based-blind");
  if (COMMENT.test(raw)) techniques.push("comment-truncation");

  return {
    raw,
    injected: techniques.length > 0,
    techniques,
    tautology: techniques.includes("tautology"),
    comment: techniques.includes("comment-truncation"),
    blindTime: techniques.includes("time-based-blind"),
    stacked: stackedMatch ? `${stackedMatch[1].toUpperCase()} (simulated)` : null,
    unionTable: unionTable && unionTable in TABLE_SCHEMAS ? unionTable : null,
    unknownUnionTable: unionTable && !(unionTable in TABLE_SCHEMAS) ? unionTable : null
  };
}

// ---------- query text ----------

/** The vulnerable code path: string concatenation, payload visible verbatim. */
export function buildVulnerableSql(table, key, value) {
  return `SELECT ${TABLE_SCHEMAS[table].columns.join(", ")} FROM ${table} WHERE ${key} = '${value}';`;
}

/** The fix: the value never becomes part of the statement. */
export function buildParameterizedSql(table, key) {
  return `SELECT ${TABLE_SCHEMAS[table].columns.join(", ")} FROM ${table} WHERE ${key} = ?`;
}

// ---------- execution (simulated) ----------

function project(row, columns) {
  return columns.map((column) => row?.[column]);
}

function contains(value, needle) {
  return String(value ?? "").toLowerCase().includes(String(needle).toLowerCase());
}

/**
 * Run the query against the supplied rows.
 *
 * @param {object} options
 * @param {string} options.table           key into TABLE_SCHEMAS
 * @param {string} options.value           raw user input (the injection point)
 * @param {boolean} [options.parameterized] run the prepared-statement path
 * @param {object} options.dataset         { items: [], users: [], orders: [] }
 * @param {boolean} [options.isAdmin]      gates the `users` table
 * @returns {{ok: boolean, error?: string, sql: string, mode: string,
 *            tables: {title: string, columns: string[], rows: string[][]}[],
 *            notes: {level: string, text: string}[], analysis: object}}
 */
export function runQuery({ table, value, parameterized = false, dataset = {}, isAdmin = false }) {
  const schema = TABLE_SCHEMAS[table];
  if (!schema) {
    return {
      ok: false,
      error: `Unknown table "${table}".`,
      sql: "",
      mode: parameterized ? "parameterized" : "vulnerable",
      tables: [],
      notes: [],
      analysis: analyzePayload("")
    };
  }
  if (!parameterized && ADMIN_ONLY_TABLES.includes(table) && !isAdmin) {
    return {
      ok: false,
      error: `Access denied for table "${table}".`,
      sql: "",
      mode: "vulnerable",
      tables: [],
      notes: [],
      analysis: analyzePayload(value)
    };
  }

  const rows = Array.isArray(dataset[table]) ? dataset[table] : [];
  const analysis = analyzePayload(value);
  const sql = parameterized ? buildParameterizedSql(table, schema.key) : buildVulnerableSql(table, schema.key, value);
  const notes = [];
  const tables = [];

  if (parameterized) {
    // Prepared statement: the value is bound as data and compared literally,
    // so it can never be parsed as SQL — the classic payload matches nothing.
    const matched = value === "" ? [] : rows.filter((row) => String(row?.[schema.key] ?? "") === String(value));
    tables.push({
      title: `${table} · ${matched.length} row${matched.length === 1 ? "" : "s"}`,
      columns: schema.columns,
      rows: matched.map((row) => project(row, schema.columns))
    });
    notes.push({
      level: "safe",
      text: `Parameterised query: the value is bound as data (?), never concatenated. ${
        analysis.injected
          ? `The payload ${analysis.techniques.join(" + ")} was matched as a literal string, so it returned ${matched.length} rows — the injection failed.`
          : "No injection markers detected."
      }`
    });
    return { ok: true, sql, mode: "parameterized", tables, notes, analysis };
  }

  // ---- vulnerable path: the payload changes what comes back ----
  notes.push({
    level: "danger",
    text: "Vulnerable path: the value was concatenated straight into the statement (see the SQL below)."
  });

  if (analysis.stacked) {
    notes.push({
      level: "danger",
      text: `Stacked statement detected: ${analysis.stacked}. A real server would have executed it. This simulator reports it and changes nothing — the table is still here.`
    });
    return { ok: true, sql, mode: "vulnerable", tables: [], notes, analysis };
  }

  let matched;
  if (analysis.tautology) {
    matched = rows;
    notes.push({
      level: "danger",
      text: `Tautology (${analysis.raw}) closed the string literal and made the WHERE clause always true — the "find this one row" query now returns all ${rows.length} rows.`
    });
  } else if (value === "") {
    matched = [];
    notes.push({ level: "info", text: "Empty value: nothing to match." });
  } else if (analysis.injected) {
    matched = [];
    notes.push({
      level: "warn",
      text: "Injection markers found but none this simulator models — the real server would still be running attacker-controlled SQL."
    });
  } else {
    matched = rows.filter((row) => contains(row?.[schema.key], value));
    notes.push({ level: "info", text: `Normal lookup on ${schema.key}, ${matched.length} row(s) matched.` });
  }

  if (analysis.comment) {
    notes.push({
      level: "warn",
      text: "Comment marker found: a real engine would ignore everything after it, hiding the rest of the intended query."
    });
  }
  if (analysis.blindTime) {
    notes.push({
      level: "warn",
      text: "Time-based blind injection detected: the response delay is the data channel. No delay is simulated here — nothing blocks the page."
    });
  }

  tables.push({
    title: `${table} · ${matched.length} row${matched.length === 1 ? "" : "s"}${analysis.tautology ? " (leaked)" : ""}`,
    columns: schema.columns,
    rows: matched.map((row) => project(row, schema.columns))
  });

  if (analysis.unionTable && ADMIN_ONLY_TABLES.includes(analysis.unionTable) && !isAdmin) {
    // Same rule the UI enforces: a customer session cannot read `users`,
    // injected or not. Log in as admin to see the full exfiltration.
    notes.push({
      level: "warn",
      text: `UNION SELECT … FROM ${analysis.unionTable} was blocked: this session is not an admin, so the app would have denied the rows (ST-10). Sign in as admin to replay it.`
    });
  } else if (analysis.unionTable) {
    const stolen = TABLE_SCHEMAS[analysis.unionTable];
    const stolenRows = Array.isArray(dataset[analysis.unionTable]) ? dataset[analysis.unionTable] : [];
    tables.push({
      title: `${analysis.unionTable} · ${stolenRows.length} row${stolenRows.length === 1 ? "" : "s"} (appended by UNION)`,
      columns: stolen.columns,
      rows: stolenRows.map((row) => project(row, stolen.columns))
    });
    notes.push({
      level: "danger",
      text: `UNION SELECT … FROM ${analysis.unionTable}: the attacker asked the database for a different table in the same result set. Rows from ${analysis.unionTable} — including the ${analysis.unionTable === "users" ? "password hash" : "data"} column — are appended above.`
    });
  } else if (analysis.unknownUnionTable) {
    notes.push({
      level: "warn",
      text: `UNION SELECT … FROM ${analysis.unknownUnionTable}: no such table in this schema, so the real statement would have errored out.`
    });
  }

  return { ok: true, sql, mode: "vulnerable", tables, notes, analysis };
}

/** One-click payloads for the console. `id` is the data-action value. */
export const SAMPLE_PAYLOADS = [
  {
    id: "tautology",
    label: "Bypass the filter",
    payload: "' OR '1'='1",
    expect: "Returns every row of the table instead of one."
  },
  {
    id: "union",
    label: "Steal another table",
    payload: "' UNION SELECT id, name, email, role, password FROM users --",
    expect: "Appends the whole users table to the result set."
  },
  {
    id: "stacked",
    label: "Stack a DROP",
    payload: "'; DROP TABLE items; --",
    expect: "Report only — this simulator never deletes anything."
  },
  {
    id: "blind",
    label: "Time-based blind",
    payload: "' OR SLEEP(5) --",
    expect: "Detected as a delay probe; no delay is simulated."
  }
];
