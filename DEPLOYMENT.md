# Deployment Runbook — IAS2 Commerce

How releases get from `main` to the live site, what can go wrong, and how
to verify a deploy actually landed. The pipeline is fully automated:
**push to `main` → tests → fingerprint gate → deploy zip → FTPS upload to
InfinityFree**. This document is the map of that pipeline plus the
playbook for verifying and fixing it.

- Repo: `https://github.com/qjncunanan01-ux/IAS2`
- Workflow: `.github/workflows/build-deploy-zip.yml`
- Live site: `https://ias2.infinityfree.me`
- Trigger: every push to `main`, or **Actions → Build deploy zip → Run workflow** (manual dispatch)

---

## 1. How the pipeline works

Both jobs run on every push. `deploy` only starts after `build` succeeds.

| Stage | Step | Fails the run when… |
| --- | --- | --- |
| **build** | Syntax-check all `js/**` | Any module has invalid JS (`node --check`) |
| | `npm test` (77 tests) | Any unit test fails — broken code never ships |
| | `node tools/fingerprint.mjs --check` | Any asset URL lacks its current `?v=<hash>` (run `npm run fingerprint` and commit) |
| | Verify required files | Any of `index.html`, `styles.css`, `js/main.js`, `assets/placeholder.svg`, `assets/vendor/lucide.min.js`, `404.html`, `.htaccess` is missing |
| | Build `ias2-deploy.zip` | — (always succeeds if reached) |
| | Upload artifact (kept 90 days) | — |
| | Refresh rolling `latest` release | — (release tag `latest` always holds the newest build) |
| **deploy** | Check deploy secrets are present | Any of the three secrets is unset — the error **names the missing one** |
| | Download artifact + unpack | — |
| | Upload to InfinityFree over FTP | Bad credentials, FTP blocked, or host unreachable |

Notes:

- `concurrency` cancels superseded runs, so rapid pushes don't queue up.
- The zip ships `index.html`, `styles.css`, `404.html`, `.htaccess`,
  `README.md`, `js/`, `assets/`. Serving is denied for `.md`/`.map`/
  `.log`/`.bak` by `.htaccess` — `README.md` is in the zip for humans, not the web.
- FTP-Deploy-Action writes a `.ftp-deploy-sync-state.json` into `htdocs`
  so unchanged files are skipped. Seeing it (and InfinityFree's own
  `DO NOT UPLOAD FILES HERE` / `.override`) in the file manager is normal.
- **Cache policy exception:** `js/modules/state.js` is referenced *without*
  a fingerprint (ESM module identity requires a bare specifier), so
  `.htaccess` carves it out of the immutable JS rule and serves it
  `no-cache, must-revalidate`. The `tests/cache-policy.test.js` suite fails
  CI if `.htaccess` and `tools/fingerprint.mjs` ever disagree about this.
  Note: visitors who loaded the site **before** this policy shipped may hold
  the old `state.js` cached `immutable` for up to a year — harmless while
  the file is unchanged, but if `state.js` ever changes, expect stragglers
  until their cache expires (fingerprinted files don't have this problem).

## 2. Required secrets

**Settings → Secrets and variables → Actions → *Repository secrets*.**
Names are case-sensitive. Values:

| Secret | Value | Where it comes from |
| --- | --- | --- |
| `FTP_HOST` | `ftpupload.net` | InfinityFree client area → Manage → FTP Details |
| `FTP_USERNAME` | `if0_42983202` | Same place (the `if0_…` username, not your account email) |
| `FTP_PASSWORD` | *(the FTP password)* | Same place via **Show/Hide** — it is **not** your InfinityFree login password |

### Rotating the FTP password

1. InfinityFree client area → **Accounts** → **Manage** → **FTP Details** → **Change Password**.
2. Use a generated password from a password manager. Don't paste it into chats.
3. Immediately update the `FTP_PASSWORD` secret: either edit it yourself in
   the GitHub UI (recommended — the value goes straight from your password
   manager to GitHub), or save it to a local file and have your assistant
   set the secret from there and delete the file.
4. Until the secret matches, deploys **fail loudly at the pre-flight step**
   — that is by design; nothing is silently skipped.

`FTP_HOST` and `FTP_USERNAME` never change during a rotation.

## 3. Cutting a release

**Normal flow** — commit and push to `main`:

```bash
git push origin main        # if pushes stall: git -c http.version=HTTP/1.1 push origin main
```

**Deploy without a code change** (e.g. after rotating a secret) — push an
empty trigger commit:

```bash
git commit --allow-empty -m "Trigger deploy: <reason>"
git push origin main
```

Or use **Actions → Build deploy zip → Run workflow** (manual dispatch).

**After touching any JS/CSS/SVG**, fingerprints must be refreshed *before*
pushing, or CI stops at the fingerprint gate:

```bash
npm run fingerprint         # rewrites stale ?v= refs (or: node tools/fingerprint.mjs --apply)
npm test                    # 77 tests (auto-discovered), must stay green
git add -A && git commit -m "..." && git push origin main
```

## 4. Verifying a release

### 4.1 CI-level (did the pipeline succeed?)

Poll the latest run — no authentication needed for these:

```bash
curl -s "https://api.github.com/repos/qjncunanan01-ux/IAS2/actions/runs?per_page=1" \
  | grep -E '"(id|status|conclusion|head_sha)"'
```

Both jobs must end `conclusion: success`:

```bash
curl -s "https://api.github.com/repos/qjncunanan01-ux/IAS2/actions/runs/<RUN_ID>/jobs" \
  | grep -E '"(name|conclusion)"'
```

**Reading a failure without admin rights:** job *logs* require repo admin,
but check-run *annotations* are public and contain the `::error` messages
(e.g. which secret is missing):

```bash
curl -s "https://api.github.com/repos/qjncunanan01-ux/IAS2/commits/<SHA>/check-runs"   # find the failed check-run id
curl -s "https://api.github.com/repos/qjncunanan01-ux/IAS2/check-runs/<ID>/annotations"
```

To retry after fixing secrets: **Actions → failed run → Re-run failed jobs**
(the build job is reused; only deploy reruns).

### 4.2 Live-level (is the site actually serving the new build?)

Use a **fresh/incognito browser profile**. Two hosting quirks to expect:
the very first visit redirects through InfinityFree's `?i=1` JS challenge
(benign, sets a cookie), and the hosting proxy may add its own headers.

1. **Fingerprints match the commit you pushed.** CI builds from `main`, so
   live `?v=` hashes must equal your local repo's (after
   `node tools/fingerprint.mjs --check` passes locally). In the browser
   console:

   ```js
   [...document.scripts].map(s => s.src)          // each .js must end in ?v=<hash>
   document.querySelector('link[rel=stylesheet]').href
   ```

   Compare with `grep -o "main.js?v=[0-9a-f]*" index.html`. Any mismatch
   means you're looking at an old deploy or a stale cache — fingerprints
   make the latter impossible for JS/CSS, so suspect the deploy first.

2. **Cache headers** (proves `.htaccess` went live):

   ```js
   fetch('/js/main.js?v=<hash>', {cache:'no-store'})
     .then(r => r.headers.get('cache-control'))
   // expect: "public, max-age=31536000, immutable"
   ```

3. **Security headers** — all seven must be present on the document
   (`curl -sI https://ias2.infinityfree.me/ | grep -iE "content-security|x-frame|x-content|referrer|permissions|cross-origin"`,
   or from the browser console):

   ```js
   fetch(location.href, {cache:'no-store'}).then(r =>
     ['content-security-policy','x-frame-options','x-content-type-options',
      'referrer-policy','permissions-policy','cross-origin-opener-policy',
      'cross-origin-resource-policy'].map(k => [k, r.headers.get(k)]))
   ```

   CSP must show `script-src 'self'` (no `unsafe-inline`). Full details:
   SECURITY-TESTING.md **ST-20**.

4. **Functional smoke** (2 minutes): shop shows **12 product cards**;
   add to cart increments the badge + toast; quick view opens and closes
   with `Escape`; login as `admin@ias2.test` reaches the 4 admin tabs;
   theme toggle flips. **DevTools console must be clean** — any CSP
   violation is a regression.

5. **No third-party code** (ST-23): Network tab filtered by domain shows
   only `ias2.infinityfree.me` — icons and the Supabase client come from
   vendored `assets/vendor/*.js`, never a CDN. (`connect-src` also
   permits `*.supabase.co` for the optional backend, but with the
   `supabase-url`/`supabase-anon-key` metas empty no such request is
   ever made.)

## 5. Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| Deploy fails at *"Check deploy secrets are present"* naming a secret | That secret is unset/misnamed (see §2) | Set the exact name in repo secrets → re-run failed jobs |
| Deploy fails at FTP upload (`530` login incorrect) | Password rotated but secret not updated (or vice versa) | Sync `FTP_PASSWORD` per §2, re-run failed jobs |
| Deploy fails at fingerprint gate | Asset changed without refreshing refs | `npm run fingerprint`, commit, push again |
| Tests fail on CI but pass locally | Usually an uncommitted file the suite reads | `git status`; commit everything the tests touch |
| Run shows `build → success`, no `deploy` job at all | Only on very old workflow versions | Current workflow always runs deploy; don't re-add a gate |
| Live site shows old content but CI is green | You're on a cached document in a stale profile | Fresh incognito profile; with fingerprints + `no-cache` HTML this should never persist |
| First visit shows a JS-y page then reloads | InfinityFree `?i=1` challenge | Benign hosting behavior; wait for redirect |
| `curl` to the site dies locally (exit 56) | Local TLS clash with the InfinityFree proxy | Verify through a browser instead (as in §4.2) |

## 6. Manual fallback deploy

If CI is broken and you need the site updated now:

1. Download `ias2-deploy.zip` from
   `https://github.com/qjncunanan01-ux/IAS2/releases/latest` (it always
   holds the newest *successful build*), or build it locally:
   `zip -qr ias2-deploy.zip index.html styles.css 404.html .htaccess js assets README.md`.
2. InfinityFree **File Manager** → open `htdocs` → upload the zip → **Extract in place**.
3. Confirm `index.html` sits directly inside `htdocs` (not in a subfolder).
4. Fix CI at leisure — a manual deploy is a stopgap, not a bypass of the test gates.

## 7. Rollback

Artifacts from every run are kept **90 days**:

1. **Actions → Build deploy zip** → pick the last known-good run →
   **Artifacts → ias2-deploy** → download.
2. Extract and upload over `htdocs` (same as §6).

Older `?v=` hashes work fine — they are self-contained URLs, so rolling
back is safe and instant. Then fix forward on `main`.

## 8. Security hygiene

- Secrets live only in GitHub's secret store — never in the repo, the zip,
  or issue text. The pre-flight step prints only *which* secret is missing.
- Treat any password that has appeared in a chat or screenshot as burned:
  rotate it (§2) and update the secret in the same sitting.
- GitHub Actions runs on `ubuntu-latest` with `permissions: contents: write`
  (needed for the rolling release). Don't widen it.
- The deploy credential grants **write access to the live site** — that is
  the threat model for keeping `FTP_PASSWORD` current and unique.
