# CODEX-010 — deployed synthetic staging

18 October 2026. Internet staging is deployed and automated hosted acceptance passed. **Real phone acceptance and real restaurant/customer use remain unapproved/unperformed.**

## Entry points

- Canonical application: https://menuflow-web-staging.menuflow.workers.dev
- Shared login: https://menuflow-web-staging.menuflow.workers.dev/login
- Restaurant dashboard: https://menuflow-web-staging.menuflow.workers.dev/admin
- Private PC-only activation/QR handoff: http://127.0.0.1:5211
- PC-only printable table QRs: http://127.0.0.1:5211/qr
- Pages alias: https://menuflow-staging.pages.dev — deployed, but this PC's network cannot reach it reliably; not the canonical pilot URL.

The staging operator is `admin@menuflow.com`, a newly created fictional staging identity with owner membership in the fictional cafe. It is separate from the preserved local admin UUID. No account password was chosen, fetched or logged by the agent; the user chooses a password privately through the handoff. Supabase may assign an internal password verifier on invitation, so its nonempty-verifier boolean is not proof the human chose a password. The original local admin and `.dev.vars` were not modified by cloud provisioning.

## Deployed topology and scope

Browser → public `menuflow-web-staging` Worker (static assets and `/api/*`) → `MENUFLOW_API` service binding → private `menuflow-api-staging` Worker → Supabase `qnvsioxptgxrmoprlbbc` in **Ekintaner's Org**, Frankfurt `eu-central-1`. The original Pages deployment uses the same private API binding. The API Worker still has `workers_dev:false`, `preview_urls:false`, no routes. Only the web Worker exposes a workers.dev frontend; it has no Supabase secrets. It reuses the tested Pages proxy unchanged for API requests and never falls through to SPA assets on a missing binding.

The new organization was verified empty before creation. Supabase quoted **USD 0/month**, and its Dashboard shows Free. No paid plan/add-on, custom domain purchase, account creation for a cloud provider or real restaurant onboarding occurred. Existing Cloudflare OAuth was used; credentials are stored encrypted with the key in Windows Credential Manager. Actual Cloudflare account subscription/usage counters were not inspected; no upgrade/subscription/payment action was performed. Free-plan capacity/availability is not guaranteed by this small test.

All eight reviewed migrations are applied with repository-matching versions/names. All 17 public tables enforce RLS. The private menu-image bucket accepts only PNG/JPEG/WebP up to 307200 bytes. A public-key HTTP request selecting the private schema returned 406. Two-owner database isolation and anon/QR-hash denial passed in a rollback-only cloud transaction. Security/performance advisors had no WARN/ERROR findings; INFO-only findings are documented in [CODEX-010](CODEX-010.md).

The only persistent business data is fictional **MenuFlow Test Kafe**, four tables, three products and two private sample images. Hosted tests left **three synthetic served orders**, **one closed/paid test check**, and **one synthetic settlement**. Two early driver attempts were completed through valid order transitions before the final settlement. No financial records were deleted or actual money collected. Registration intake on `DEPLOYMENT_ENV=staging` returns 503 `STAGING_ONLY` before database access, preventing real application storage. Local and pilot behavior remains unchanged. Staging visibly says it accepts only test data and sends `X-Robots-Tag: noindex, nofollow` (indexing prevention is not authentication).

## Auth and secrets

Direct Supabase public signup was disabled; `/auth/v1/settings` returned `disable_signup:true`. Anonymous sign-in remains disabled. Auth Site URL is the canonical workers.dev HTTPS origin. Exact `/activate` redirects for that origin and the Pages alias are allowed; there are no wildcard callbacks. The user-facing QR/customer flow needs no login. Platform/staff authorization remains server-side and membership is checked live.

The user entered the new project's existing server key through the loopback-only secret form. It was verified server-side and uploaded along with the project URL, publishable key and verified **staging** admin UUID only to the API Worker's secret store. No secret went to Git, Pages, static assets, VITE variables, screenshots, reports or command arguments. The local secret directory has current-user/SYSTEM ACLs. The temporary test-session JWT and local server-key copy are removed after verification/secret upload and after the handoff process has loaded what it needs into memory. Provider secret storage remains required for the deployed API. Never regenerate the preserved local admin to set up this environment.

The handoff keeps its single-use activation hash only in process memory, binds `127.0.0.1:5211`, validates Host/method, sends no-store/no-referrer/CSP, and expires after one hour. At handoff expiry it also attempts to close ordering on only the fictional cafe. This is a local process cutoff, not a durable hosted scheduler: the computer/process must remain running for the cutoff; the dashboard/global pause command is the fallback. Menu hosting and QR assets do not depend on this PC. Real SMTP delivery, full managed Auth/Storage disaster recovery and human password/login acceptance are not claimed.

## Verification

- Local lint, TypeScript/Vite build, **129 unit/API tests**, **52 desktop/mobile browser tests** passed on this release. Existing migration/SQL/concurrency/restore and real local Supabase integration baseline passed earlier in CODEX-010; this release did not change migrations.
- Hosted HTTPS health and original request/Origin/cookie forwarding through the real web/API service binding passed. No certificate validation bypass was used.
- Real cloud operator session authenticated; anonymous platform returned 401; foreign-origin mutation returned 403; unknown API returned JSON 404; real registration intake returned `STAGING_ONLY`; noindex response header verified.
- Pixel 7 browser emulation loaded the real hosted QR menu/private signed photos, removed the fragment and obtained a Secure/HttpOnly/SameSite=Strict guest cookie.
- Hosted synthetic order submission, same-key retry without duplicate creation, separate-guest order isolation, staff panel visibility, accepted → preparing → ready → served transitions, check total, synthetic pay/close, same-key settlement replay, old-visit rejection and fresh QR scan all passed.
- Hosted Auth rate limiting returned 429 with `Retry-After:60` using a nonexistent synthetic account only. The eventual-consistency binding did not stop exactly at request 11 in the first short burst; it is not a strict global quota counter.
- Two initial hosted-driver issues were corrected without weakening app checks: lazy images needed viewport/load waiting; internal terminal status is `served`, not `delivered`, and check overview rows use table `id`. Failed attempts are not counted as success.

Reproduction: `npm run build:staging`, `npm run pilot:check`, `npx wrangler deploy --dry-run --config deploy/web.staging.json`. Authorized upload uses the corresponding staging configs; CI never deploys automatically. `scripts/test-hosted-staging-010.mjs` is a synthetic acceptance driver requiring a short-lived private fixture session; run before delivering a fresh operator activation link, never with a real user's password or retained session. It does not print QR/session values or record traces.

## Network findings

Default DNS on this PC returned `213.14.227.50` for pages.dev, while independent Google/Cloudflare DNS-over-HTTPS queries returned Cloudflare addresses. Default access timed out and a per-request resolved-address diagnostic reset the TLS connection. No OS/browser DNS/security setting was changed and no TLS warning was bypassed. The workers.dev endpoint initially failed TLS during first-hostname propagation, then became reachable with normal certificate validation and passed the hosted tests. The exact cause of the network-specific pages.dev failure is not asserted.

A protected one-hour Quick Tunnel fallback was briefly prepared with official `cloudflared 2026.10.1`, SHA-256 `4d2490e74082c5d48dbfedaf92576fa5bd1702379ab88eb7faa0cfbe8dc891b6`, matching release metadata. It allowed only the operator's existing Cloudflare-account email. It was stopped without phone testing once workers.dev worked; the temporary Node listeners and cloudflared process were closed. It is not the delivered frontend and is not evidence of a completed protected-tunnel acceptance test. No provider account or paid service was created for it.

## Ordering window, budget and rollback

The API's repository config retains fail-safe `ORDERING_DISABLED=true`. For the approved synthetic rehearsal only, the deployed runtime override is `false` and the fictional cafe is open. Keep the visible staff panel, four test tables, a handful of test guests and one operator. The PC handoff process attempts to close that cafe after one hour. To stop immediately, close ordering in the restaurant dashboard, or deploy `deploy/worker.staging.json` without the false override; defaults then pause new orders while tracking/admin remain available. Never delete immutable settlements or restore over active service.

Current API deployment after opening the synthetic rehearsal: `a4b46a46-d134-44c9-aed1-2a6821dabc99`. Private paused fallback: `11dcf440-199f-43c9-9927-f031f516651c`. Web Worker initial active version: `f41ac0cd-9bc9-45b4-9b6c-7c99b88d22f7`. Pages alias deployment: `32735427`. Use schema-compatible rollback only. Subsequent identical asset deployments may have later web version IDs; record the final tool-returned ID in the release report.

Free limits, monitoring thresholds, backup/restore/KVKK/SMTP ownership and real-data approval gates in [pilot operations](pilot-operations.md), [backup/restore](backup-restore.md) and [CODEX-010](CODEX-010.md) remain. Provider counters/CPU and full managed disaster restoration have not been proven by local timing or this low-volume hosted run. No claim of production SLA, unlimited free usage, legal compliance or completed physical payment is made.

## User phone acceptance

1. On this PC, open http://127.0.0.1:5211 and privately choose the staging operator password. Then sign in at the canonical `/login` as `admin@menuflow.com`; open `/admin` for the test cafe. The platform role's default destination is `/platform`, but its cafe-owner membership also permits `/admin`.
2. Open http://127.0.0.1:5211/qr or the delivered `MenuFlow-test-QR.html`; print or display the labelled QR. Scan it with the phone's native camera. No customer login, IP collection or certificate installation is required.
3. Use fictional notes only. Check business/table/photos/prices, submit one order, move it through delivery in the staff panel, confirm its table total and record a **simulated** physical payment/close. Rescan for a new visit and confirm the old guest cannot add to it.
4. Repeat on WiFi and cellular, ideally Android Chrome and iPhone Safari. Record OS/browser/network/time/release/result without secrets. These physical tests remain **pending**; no real restaurant/customer processing is authorized.
