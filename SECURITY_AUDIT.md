# Security Audit Report
**Project:** internal-backup-perwira  
**Date:** 2026-05-04  
**Status:** All HIGH/MEDIUM findings fixed.

---

## Findings & Fixes

---

### [SEVERITY: CRITICAL]
**File:** `.gitignore`, `backend/.gitignore`, `frontend/.gitignore` (missing)  
**Issue:** No `.gitignore` files existed anywhere in the repository.  
**Risk:** A `git add .` by any contributor would commit `.env` files (containing `APP_KEY`, database credentials, Telegram tokens), `vendor/`, `node_modules/`, and compiled assets to version history. Secrets committed to git are considered permanently compromised even after removal.  
**Fix:** Created proper `.gitignore` files at root, `backend/`, and `frontend/` that exclude all `.env*` files (except `.env.example`), vendor/node_modules directories, build output, and editor files.

---

### [SEVERITY: HIGH]
**File:** `backend/app/Http/Controllers/BackupFilesController.php` — `download()`  
**Issue:** Path traversal protection relied only on `str_contains($path, '..')`, which can be bypassed with URL-encoded sequences (`..%2F`) or other encoding tricks that PHP's query string parser may normalise after the check.  
**Risk:** An authenticated attacker could read arbitrary files from the server filesystem (e.g. `/etc/passwd`, application `.env`, private keys) by crafting a `path` parameter.  
**Fix:** Replaced string-based check with `realpath()`-based validation. The resolved absolute path must start with the backup base directory. Null bytes are still blocked explicitly.

---

### [SEVERITY: HIGH]
**File:** `backend/app/Http/Controllers/NodeController.php` — `downloadBackup()`  
**Issue:** Used `basename()` on the filename (correct) but passed the result directly to `file_exists()` / `response()->download()` without `realpath()` confirmation.  
**Risk:** While `basename()` strips directory separators, OS-specific edge cases and symlink attacks remain possible.  
**Fix:** Applied `realpath()` and verified the resolved path starts inside the backup base directory before serving the file.

---

### [SEVERITY: HIGH]
**File:** `backend/app/Http/Controllers/NodeController.php` — `remoteExecute()`  
**Issue:** Command field validated only `max:500`. Any character was accepted, including shell metacharacters (`'`, `` ` ``, `$()`, `|`, `;`, `<`, `>`).  
**Risk:** If the Spatie SSH library constructs a shell command string locally before sending over SSH, characters like `'` can break out of shell quoting, enabling local command injection on the VPS.  
**Fix:** Added `regex` rule whitelisting only characters needed for RouterOS CLI: alphanumerics, spaces, `/`, `-`, `=`, `.`, `,`, `_`, `:`, `@`, `[]`, `+*?!`, `"`, `#`, `&`, `()`. All shell metacharacters (`'`, `` ` ``, `$`, `;`, `|`, `<`, `>`, newlines) are rejected with HTTP 422.

---

### [SEVERITY: MEDIUM]
**File:** `backend/app/Http/Controllers/Admin/NodeController.php` — `store()` / `update()`  
**Issue:** `host` field validated as free-form string. `ssh_key_path` validated as free-form string allowing `../` path traversal patterns. `schedule_interval_hours` accepted any integer 1–8760.  
**Risk:**  
- Malicious `host` value containing shell metacharacters could be injected into SSH connection strings.  
- `ssh_key_path` with `../` sequences could cause the system to read key files outside expected directories.  
- Arbitrary `schedule_interval_hours` breaks the midnight-aligned slot assumption (e.g. 7h produces no clean midnight alignment).  
**Fix:**  
- `host`: regex restricted to `[a-zA-Z0-9][a-zA-Z0-9.\-\:]*` — covers IPv4, IPv6, hostnames; blocks shell metacharacters.  
- `ssh_key_path`: closure validator rejects any value containing `..` or null bytes.  
- `schedule_interval_hours`: `in:1,2,3,4,6,8,12,24` — only midnight-aligned divisors accepted.

---

### [SEVERITY: MEDIUM]
**File:** `backend/routes/api.php` + `AppServiceProvider.php`  
**Issue:** No per-endpoint rate limits on the two highest-risk endpoints: remote command execution and manual backup trigger. Default API throttle (60 req/min globally) was the only protection.  
**Risk:** An authenticated attacker could flood the execute endpoint (e.g. 1000 SSH connections in seconds) causing DoS on MikroTik devices or the VPS itself. Backup trigger flooding could saturate disk I/O.  
**Fix:** Registered two named rate limiters in `AppServiceProvider::boot()`:
- `remote-execute`: 30 requests/minute per user ID.
- `backup-trigger`: 5 requests/minute per node+user pair.  
Applied via `->middleware('throttle:remote-execute')` and `->middleware('throttle:backup-trigger')` on the respective routes.

---

### [SEVERITY: MEDIUM]
**File:** `backend/app/Http/Controllers/BackupFilesController.php` — `index()`  
**Issue:** `type` and `node_id` query params passed directly into business logic without validation.  
**Risk:** Unexpected values could produce unpredictable directory traversal in `Storage::directories()` calls or unexpected data exposure.  
**Fix:** Added `$request->validate()` at the top of `index()`: `node_id` must be a valid UUID, `type` must be `mikrotik` or `database`, pagination params are bounded integers.

---

### [SEVERITY: LOW — Dev only]
**Tool:** npm (esbuild ≤ 0.24.2 / vite ≤ 6.4.1)  
**Issue:** 2 moderate vulnerabilities: esbuild dev server accepts cross-origin requests.  
**Risk:** Affects **development mode only** (`npm run dev`). Production builds (`npm run build`) are not affected — esbuild is a build tool, not a runtime dependency. `sourcemap: false` is already set in `vite.config.ts`.  
**Fix:** Not applied — `npm audit fix --force` would upgrade to Vite 8 (breaking change). Mitigate operationally: never run `npm run dev` on a public/production server. Fix at next planned Vite major upgrade.

---

## Items Verified — No Issues Found

| Area | Status |
|---|---|
| Auth/authorization middleware on all endpoints | ✅ Correct |
| Setup endpoint blocked after first user | ✅ Correct |
| Login rate limiting (5 attempts / 5 min / IP) | ✅ Already implemented in `AuthController` |
| `Node` model — passwords encrypted at rest | ✅ `encrypt()`/`decrypt()` accessors present |
| `Node` model — passwords hidden from JSON | ✅ `$hidden = ['ssh_password', 'db_password']` |
| `User` model — password hidden from JSON | ✅ `$hidden = ['password', 'remember_token']` |
| CORS — no wildcard origin | ✅ Specific localhost origins only |
| SQL injection — all queries use Eloquent/Query Builder | ✅ No raw concatenated queries found |
| `dangerouslySetInnerHTML` in React | ✅ None found |
| `localStorage`/`sessionStorage` credential storage | ✅ None found |
| Hardcoded secrets in frontend source | ✅ None found |
| `VITE_` env vars exposing secrets | ✅ None found |
| Session/cookie security (Sanctum stateful) | ✅ Correct |
| Stack traces exposed in production | ✅ `APP_DEBUG=false` in production config |
| Admin-only execute endpoint | ✅ `role:admin` middleware applied |
| Self-deletion prevention (UserController) | ✅ Checked before delete |
| composer vulnerabilities | ⚠️ `composer` not in PATH on audit machine — verify on server with `composer audit` |
