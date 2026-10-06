// Supabase scaffold — the client half of the optional hosted backend.
//
// This is deliberately NOT wired into app state: localStorage stays the
// source of truth until the migration phase flips the switch. Everything
// here is fail-closed — no config, no vendored UMD build, or a config that
// does not match the CSP → getDb() returns null and callers do nothing.
//
// Config resolution (first hit wins):
//   1. localStorage key `ias2.commerce.supabase` — JSON {"url","anonKey"}
//      (runtime override, handy during development)
//   2. the <meta name="supabase-url"> / <meta name="supabase-anon-key">
//      tags in index.html — the deploy-time values
//
// The anon key is PUBLIC by design (it ships in every browser). Row-level
// security in supabase/schema.sql is the actual guard; a leaked anon key
// grants exactly as much as the RLS policies allow, which for an
// unauthenticated visitor is "read the public catalog".

const CONFIG_STORAGE_KEY = "ias2.commerce.supabase";

// Same allowlist the CSP enforces (connect-src https://*.supabase.co) — a
// config that points anywhere else could never reach the network anyway,
// so we reject it up front instead of producing opaque CSP violations.
const HOST_SUFFIX = ".supabase.co";

let cached = null;

function readMeta(name) {
  const tag = document.querySelector(`meta[name="${name}"]`);
  const value = tag ? String(tag.getAttribute("content") || "").trim() : "";
  return value;
}

function readStoredConfig() {
  try {
    const raw = localStorage.getItem(CONFIG_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return {
      url: String(parsed.url || "").trim(),
      anonKey: String(parsed.anonKey || "").trim()
    };
  } catch {
    // Corrupt JSON or storage unavailable — treat as "not configured".
    return null;
  }
}

function validConfig(config) {
  if (!config || !config.url || !config.anonKey) return null;
  if (config.anonKey.length < 20) return null;
  let parsed;
  try {
    parsed = new URL(config.url);
  } catch {
    return null;
  }
  const hostOk = parsed.protocol === "https:" && parsed.hostname.endsWith(HOST_SUFFIX);
  return hostOk ? config : null;
}

export function getSupabaseConfig() {
  return validConfig(readStoredConfig()) || validConfig({
    url: readMeta("supabase-url"),
    anonKey: readMeta("supabase-anon-key")
  });
}

export function isSupabaseConfigured() {
  return Boolean(getDb());
}

// Returns the shared client, or null when the backend is not set up.
// Never throws: a missing UMD build or half-filled config just means
// "stay on localStorage".
export function getDb() {
  const config = getSupabaseConfig();
  if (!config) return null;
  if (cached && cached.url === config.url && cached.anonKey === config.anonKey) {
    return cached.client;
  }
  const factory = typeof window !== "undefined" && window.supabase
    ? window.supabase.createClient
    : null;
  if (typeof factory !== "function") return null;
  try {
    const client = factory.call(window.supabase, config.url, config.anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: false,
        detectSessionInUrl: false
      }
    });
    cached = { url: config.url, anonKey: config.anonKey, client };
    return client;
  } catch {
    // Misconfigured project ref etc. — still fail closed, never break boot.
    return null;
  }
}

// Drop the memoised client (config changed, tests, teardown).
export function resetDbClient() {
  cached = null;
}

// Console evidence helper: app.db.status() shows exactly why the backend
// is or is not live without guessing (see SECURITY-TESTING / ZAP §5).
export function getDbStatus() {
  const config = getSupabaseConfig();
  const libLoaded = Boolean(
    typeof window !== "undefined" && window.supabase &&
    typeof window.supabase.createClient === "function"
  );
  return {
    libLoaded,
    configured: Boolean(config),
    // True only when getDb() would actually return a client.
    connected: Boolean(getDb()),
    url: config ? config.url : ""
  };
}
