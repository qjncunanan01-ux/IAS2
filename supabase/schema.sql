-- ============================================================================
-- IAS2 Commerce — Supabase migration (schema + RLS)
--
-- Run in the Supabase SQL editor (or `supabase db push`) on the project that
-- will serve the app. Mirrors the localStorage shapes in js/modules/state.js
-- and the import sanitizers in js/utils/security.js, so rows round-trip
-- without a mapping layer (multi-word columns keep their app names:
-- "userId", "paymentMethod", "createdAt", …).
--
-- Order matters and is deliberate: all three TABLES first, then the
-- app_role() helper (a LANGUAGE sql function, so create it only after the
-- `users` table it selects from exists), then the RLS POLICIES (which call
-- app_role()), then GRANTS. Re-running the file is safe: tables use
-- "if not exists", policies are dropped before creation, grants are
-- idempotent.
--
-- SECURITY MODEL (this is the whole point of moving off localStorage):
--   * RLS is ENABLED on every table and no policy grants anonymous users
--     anything except reading the active catalog. Anonymous can read
--     NOTHING about users or orders — not even with a guessed URL.
--   * The anon key shipped in the browser is public BY DESIGN. It is a
--     capability to *reach* PostgREST; these policies decide what arrives.
--     Hunting "leaked anon key" is therefore the wrong finding — hunting
--     "RLS missing/disabled" is the right one (see ZAP-BURP-WALKTHROUGH §5).
--   * PostgREST parameterises every value by construction, so classic SQL
--     injection is not reachable through /rest/v1/*. A genuine SQLi demo
--     needs a deliberately vulnerable `EXECUTE format(...)` RPC — put that
--     on a SEPARATE dev project, never on the one these policies protect.
--
-- Bootstrap: default catalog lives in js/modules/state.js (seed v3); the
-- easiest seed is a JSON export from the app's Data Tools screen loaded via
-- `insert ... select jsonb_to_recordset(...)`, rather than re-typing rows.
-- Demo users (admin@ias2.test / user@ias2.test) are placeholders — real
-- sign-in moves to Supabase Auth in the next phase, see the users table note.
-- ============================================================================

-- ============================================================================
-- 1. TABLES
-- ============================================================================

-- ----------------------------------------------------------------------------
-- items — the public catalog (state.items / sanitizeImportedItems)
-- ----------------------------------------------------------------------------
create table if not exists public.items (
  id          text primary key check (char_length(id) between 1 and 60),
  name        text not null check (char_length(name) between 1 and 80),
  category    text not null default 'Uncategorized' check (char_length(category) <= 40),
  price       numeric(12,2) not null check (price >= 0),
  stock       integer not null default 0 check (stock >= 0),
  image       text not null default 'assets/placeholder.svg',
  description text not null default '' check (char_length(description) <= 400),
  active      boolean not null default true,
  featured    boolean not null default false
);

alter table public.items enable row level security;

-- ----------------------------------------------------------------------------
-- users — app accounts (state.users / sanitizeImportedUsers)
--
-- PHASE-2 NOTE: `password` holds whatever the current app scheme stores
-- (salted SHA-256). When sign-in moves to Supabase Auth, users are created in
-- auth.users and this column must be DROPPED — until then it is the most
-- sensitive column in the schema, which is why NO grant goes to `anon` and
-- no policy lets anyone read another user's row.
-- ----------------------------------------------------------------------------
create table if not exists public.users (
  id        text primary key check (char_length(id) between 1 and 60),
  name      text not null check (char_length(name) between 1 and 80),
  email     text not null unique check (char_length(email) <= 254),
  password  text not null check (char_length(password) <= 200),
  role      text not null default 'user' check (role in ('admin', 'user')),
  "createdAt" timestamptz not null default now()
);

alter table public.users enable row level security;

-- ----------------------------------------------------------------------------
-- orders — checkouts (state.orders / sanitizeImportedOrders)
--
-- `items` is the validated line-item array (itemId, name, price, qty) exactly
-- as the app stores it; `total` is recomputed server-side on migration by the
-- same rule the client enforces (sum of price*qty) — never trust an imported
-- envelope total (the app's importer recomputes it too, security.js).
-- ----------------------------------------------------------------------------
create table if not exists public.orders (
  id            text primary key check (char_length(id) between 1 and 60),
  -- Stores the app's user id; once Supabase Auth is wired it stores
  -- auth.uid()::text (a UUID), which is exactly what the policies compare.
  "userId"      text not null check (char_length("userId") between 1 and 60),
  "customerName" text not null default '' check (char_length("customerName") <= 80),
  address       text not null default '' check (char_length(address) <= 300),
  "paymentMethod" text not null default 'Unknown' check (char_length("paymentMethod") <= 30),
  "paymentReference" text not null default '' check (char_length("paymentReference") <= 40),
  status        text not null default 'Processing'
                check (status in ('Processing', 'Paid', 'Completed', 'Cancelled')),
  items         jsonb not null check (jsonb_typeof(items) = 'array'),
  total         numeric(12,2) not null default 0 check (total >= 0),
  "createdAt"   timestamptz not null default now()
);

create index if not exists orders_user_idx on public.orders ("userId");
create index if not exists orders_status_idx on public.orders (status);

alter table public.orders enable row level security;

-- ============================================================================
-- 2. HELPER — the caller's role, used by every policy below.
--
-- SECURITY DEFINER so policies on `users` can read `users` without tripping
-- over its own RLS (recursion). It only ever returns the row belonging to
-- auth.uid() — for an anonymous visitor auth.uid() is NULL, the lookup finds
-- nothing, and the function returns NULL, which fails every `= 'admin'`
-- comparison closed.
--
-- Created AFTER public.users exists: LANGUAGE sql bodies may be analysed at
-- creation time, so the relation must be there.
-- ----------------------------------------------------------------------------
create or replace function public.app_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select u.role from public.users u where u.id = (auth.uid())::text;
$$;

revoke execute on function public.app_role() from public;
grant execute on function public.app_role() to anon, authenticated, service_role;

-- ============================================================================
-- 3. RLS POLICIES
-- ============================================================================

-- ---- items: public catalog, admin-only writes ------------------------------
-- Anyone may browse what is on sale; admins additionally see deactivated
-- rows. All writes are admin-only (role comes from `users`).
drop policy if exists "items_select_public" on public.items;
create policy "items_select_public"
  on public.items for select
  to anon, authenticated
  using (active = true or public.app_role() = 'admin');

drop policy if exists "items_insert_admin" on public.items;
create policy "items_insert_admin"
  on public.items for insert
  to authenticated
  with check (public.app_role() = 'admin');

drop policy if exists "items_update_admin" on public.items;
create policy "items_update_admin"
  on public.items for update
  to authenticated
  using (public.app_role() = 'admin')
  with check (public.app_role() = 'admin');

drop policy if exists "items_delete_admin" on public.items;
create policy "items_delete_admin"
  on public.items for delete
  to authenticated
  using (public.app_role() = 'admin');

-- ---- users: self-or-admin, no privilege escalation -------------------------
-- Read: your own row, or any row if you are an admin. The `to authenticated`
-- grant means anonymous callers never reach the policy at all — combined
-- with the REVOKE below, anon gets "permission denied" for the whole table.
drop policy if exists "users_select_self_or_admin" on public.users;
create policy "users_select_self_or_admin"
  on public.users for select
  to authenticated
  using (id = (auth.uid())::text or public.app_role() = 'admin');

-- Insert: an admin may create anyone; a signed-in user may create only their
-- OWN row, and only as a plain 'user' — the role-escalation guard. With CHECK
-- evaluated against the statement snapshot, app_role() sees the pre-existing
-- row, so nobody can bootstrap themselves into 'admin'.
drop policy if exists "users_insert_self_or_admin" on public.users;
create policy "users_insert_self_or_admin"
  on public.users for insert
  to authenticated
  with check (
    public.app_role() = 'admin'
    or (id = (auth.uid())::text and role = 'user')
  );

-- Update: row owner or admin may update; the same self-check blocks a user
-- flipping their own role to 'admin' (see insert comment).
drop policy if exists "users_update_self_or_admin" on public.users;
create policy "users_update_self_or_admin"
  on public.users for update
  to authenticated
  using (id = (auth.uid())::text or public.app_role() = 'admin')
  with check (
    public.app_role() = 'admin'
    or (id = (auth.uid())::text and role = 'user')
  );

-- Delete: admins only, and never yourself (no accidental lockout / cover-up
-- of your own trail).
drop policy if exists "users_delete_admin_not_self" on public.users;
create policy "users_delete_admin_not_self"
  on public.users for delete
  to authenticated
  using (public.app_role() = 'admin' and id <> (auth.uid())::text);

-- ---- orders: owner-scoped, forging status impossible -----------------------
-- Read: your own orders, or all of them if admin. Anonymous: no access —
-- order history is the data this migration exists to stop leaking.
drop policy if exists "orders_select_owner_or_admin" on public.orders;
create policy "orders_select_owner_or_admin"
  on public.orders for select
  to authenticated
  using ("userId" = (auth.uid())::text or public.app_role() = 'admin');

-- Create: a customer may only place orders for themselves, and always as
-- 'Processing' — you cannot POST yourself into 'Paid'. Admin/backfill may
-- insert any status (migration of historical rows).
drop policy if exists "orders_insert_owner_processing" on public.orders;
create policy "orders_insert_owner_processing"
  on public.orders for insert
  to authenticated
  with check (
    public.app_role() = 'admin'
    or ("userId" = (auth.uid())::text and status = 'Processing')
  );

-- Update: admin only. The customer UI has no legitimate order mutation
-- (the status <select> is disabled for customers), so a customer PATCH
-- attempting status changes is denied by RLS, not just by the UI.
drop policy if exists "orders_update_admin" on public.orders;
create policy "orders_update_admin"
  on public.orders for update
  to authenticated
  using (public.app_role() = 'admin')
  with check (public.app_role() = 'admin');

-- Delete: admin only — customers cannot erase order history.
drop policy if exists "orders_delete_admin" on public.orders;
create policy "orders_delete_admin"
  on public.orders for delete
  to authenticated
  using (public.app_role() = 'admin');

-- ============================================================================
-- 4. GRANTS — belt on top of the suspenders.
--
-- Supabase's default privileges hand every new table to anon + authenticated;
-- we narrow that explicitly so the intent is auditable at a glance:
--   anon      → read the active catalog, nothing else (no users, no orders)
--   authenticated → the rows the policies above allow
--   service_role  → full access (server-side migrations / admin jobs)
-- ============================================================================
revoke all on public.users  from anon;
revoke all on public.orders from anon;
revoke all on public.items  from anon;
grant select on public.items to anon;
grant select, insert, update on public.items  to authenticated;
grant select, insert, update, delete on public.items to service_role;
grant select, insert, update, delete on public.users  to authenticated, service_role;
grant select, insert, update, delete on public.orders to authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;

-- ============================================================================
-- 5. VERIFY (run as anon and as a customer — each line must do what it says):
--
--   -- as anon (SQL editor → Data API > "anon" role, or curl with the anon key):
--   select count(*) from public.items;   -- active rows only
--   select * from public.users;          -- ERROR: permission denied
--   select * from public.orders;         -- ERROR: permission denied
--
--   -- as a non-admin customer (RLS active, app_role() = 'user'):
--   select * from public.orders;         -- only rows with "userId" = own id
--   update public.orders set status = 'Paid' where id = 'order_x';  -- 0 rows
--   update public.users set role = 'admin' where id = '<own id>';   -- 0 rows
--
--   -- as admin (role = 'admin' in public.users):
--   select * from public.orders;         -- all rows
--
-- Empty policy results ("0 rows" rather than an error) are RLS working:
-- PostgREST answers 401/403 only for privilege failures, and silently
-- filters rows the policies hide. Both outcomes are evidence; neither is
-- a bug (ZAP-BURP-WALKTHROUGH §5 explains how to capture this in Burp).
-- ============================================================================
