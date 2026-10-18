# CODEX-010 — First Real Pilot: preparation and release gates

**Current deployment and user acceptance steps:** [CODEX-010 live staging](CODEX-010-live-staging.md). The following sections retain the preparation/account-switch history and are superseded by that release record where state changed.

## Current target — user's new Supabase account

Secret-intake browser correction: the initial helper's `Referrer-Policy: no-referrer` caused Chromium native form POSTs to send `Origin: null`, correctly rejected by the strict Origin check. The user's key was not saved. Changed only the intake helper to `same-origin`; outbound project links retain `rel=noreferrer`, no-store and CSP remain. The application's cookie/Origin checks were not relaxed. Validation/save outcomes now use POST/303/GET with fixed result states and readable HTML; refreshing does not repost the key. The helper stays available for the result page until its one-hour expiry and refuses overwriting a saved key. `node scripts/test-staging-setup.mjs` verifies an actual headless Chromium form sends the expected Origin, follows a 303 to a readable invalid-input result, reloads safely, and still rejects foreign/null/missing Origin and wrong Host. It uses only an invalid synthetic value, never a real secret; no secret file is created. Lint also passed. This is a local intake fix, not evidence of completed credential validation or deployment.

The user could not access the original Supabase account and requested staging under the account authenticated with their new GitHub login. After reconnecting, the tools verified a different organization, **Ekintaner's Org**, ID `heuuyjjxpxaaqejqtwlo`, with zero projects. This is the authorized active target; earlier account details below are historical and must not be used for deployment.

The provider quoted **USD 0/month** for this organization. Created separate `menuflow-staging`, Frankfurt `eu-central-1`, ref `qnvsioxptgxrmoprlbbc`, ACTIVE_HEALTHY. Verified empty public schema and zero Auth users before applying the eight repository migrations. Ledger versions/names match their original repository filenames. All 17 public tables have RLS; zero public tables lack RLS; menu-images remains private with a 307200-byte cap. Security/performance advisors returned only the same INFO categories described below, with no WARN/ERROR. A real-cloud rollback test passed owner A/B isolation, authenticated QR-hash denial and anon tenant denial, then left zero tenants/Auth users.

The old account's project was not deleted, reset or changed. The old local secret page was stopped before reconnecting. `staging-secret-setup.mjs` now pins only the new project URL; its public config was refreshed from the new project's publishable key. The old public-only config was retained privately as `.wrangler/staging-010-public.previous-account.json`. New server secrets will be saved only in `.wrangler/staging-010-qnvsioxptgxrmoprlbbc/server-secrets.json`, with a separate current-user/SYSTEM ACL; they cannot overwrite an old-account secret file. No server key has been entered by the user yet. Lint and local intake smoke passed: new project link, no old project link, Host/Origin/input rejection, no-store, and no secret file created during testing.

Cloudflare authentication remains available on the previously authorized account. Next user step: open `http://127.0.0.1:5210`, follow its link to the **new** project's API keys, and paste its existing Secret/service_role key into that local form only. Do not send the key or password to chat. New account/project selection and free publication are already authorized. Auth configuration, fictional fixtures/operator activation, secret upload, deployment and hosted phone acceptance remain pending. Local admin identity and data remain untouched.

## Authorized staging setup — follow-up

The user subsequently approved both GitHub push and free internet staging publication, then delegated organization selection. Commit `4e7772e` was pushed without force; [CI run 39114247612](https://github.com/Ekintaner/menuflow/actions/runs/39114247612) passed completely. Publication approval remains valid; no additional publication approval is needed within the synthetic/free scope.

Supabase quoted **USD 0/month**. Separate `menuflow-staging` was created in existing `Ekintaner` organization (`fddkudogrmrqxbtudxez`), Frankfurt `eu-central-1`, ref `ghvzgwntdhbvgkloqkis`. Status ACTIVE_HEALTHY. The pre-migration target had no public tables and zero Auth users. All eight reviewed migrations were applied; the tool-generated ledger timestamps were reconciled to the original repository versions/names without reapplying SQL. All 17 public tables have RLS; private schema USAGE is denied to anon, while authenticated USAGE is intentional for policy helpers and is not equivalent to exposing the private schema in the Data API. `menu-images` is private, capped at 307200 bytes and PNG/JPEG/WebP.

Cloud advisors returned no ERROR/WARN findings. INFO findings: five deliberately server-only tables have no RLS policies (deny to ordinary roles), four uncovered foreign keys, and unused indexes on the empty project. Keep the deny-by-default policies and existing indexes. Review FK index needs before expanding workload. Remediation references: [RLS without policies](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), [foreign-key indexes](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys), [unused indexes](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index).

An additional real-cloud transaction test provisioned two temporary fictional owners/tenants, verified each authenticated owner could read only its tenant, denied QR-hash access to authenticated roles and direct tenant access to anon, then rolled back everything. Final counts: zero tenants and zero Auth users. This tests database roles/RLS, not hosted end-to-end Auth/cookies. Local secret intake smoke passed Host/Origin rejection, invalid-input rejection, no-store and no credential-file creation. Initial bad-Host smoke used Node fetch, which did not send the overridden Host; retesting with an actual HTTP Host header passed. No real secret was submitted during these checks.

No fictional tenant, Auth user, customer order or cloud image has been inserted yet. Existing local data/admin and unrelated cloud projects remain unchanged. Cloudflare is not authenticated; OAuth browser handoff timed out without completion. A fresh login must be completed by the user before publishing Pages/Worker. Wrangler's Windows keyring backend had a space-in-path install bug; the pinned backend was installed correctly in Wrangler's own runtime directory, without changing project dependencies. OS-keyring storage is requested for the renewed login.

The connected Supabase tool exposes publishable keys but cannot retrieve a server secret or update Auth configuration. `scripts/staging-secret-setup.mjs` provides a one-hour, loopback-only `http://127.0.0.1:5210` form for the user to enter the **new staging project's** existing secret/service_role key without sending it to chat. It verifies the key against the fixed staging Auth admin endpoint, stores it only in ignored `.wrangler/staging-010/server-secrets.json` under a current-user/SYSTEM ACL, does not log/reflect credentials, refuses overwrite and does not read `.dev.vars`. No password is requested. The public-only config is ignored separately. Secrets must be uploaded only to `menuflow-api-staging`; the staging admin UUID still needs to be provisioned independently, without copying the local identity. After secure upload, remove the local staging secret copy when no longer needed.

Before publication, still complete exact Site URL/callback, disabled public Auth signup, private-schema Data API exclusion, Free account/quota verification, SMTP decision, fictional fixtures and secure operator activation. Then deploy the approved Pages + service-bound Worker topology and execute real hosted acceptance checks. No public application URL or working internet pilot is claimed yet. The remaining sections below preserve the original preparation evidence; their earlier approval/inventory statements describe the state before this authorized follow-up.

18 October 2026. **Prepared locally; internet staging and real restaurant pilot have not been released.**

## Product decision

Customers scan a public HTTPS QR on WiFi or cellular, without login, IP collection, local certificates or installing software. Staff and platform admin use the same `/login`; authorization chooses the destination. Registration requires platform approval. Table settlement records physical payment; there is no online payment processor.

The user rejected collecting a phone IP as the route to product testing. The LAN option below is an optional developer diagnostic only. The intended acceptance environment is an internet-accessible HTTPS staging installation with fictional data, followed by a separately approved real pilot. No customer is asked for an IP or certificate.

## Baseline and preservation

- Remote `refs/heads/main` verified as `511e84f1b098ef053430edf627a4a1d82721408c`. GitHub API confirmed Actions run `39112902546` completed successfully for that SHA. Initial working tree was clean.
- Existing frontend/API/helpers listen on loopback. Five dedicated `menuflow-local` containers run. Four required local environment names are configured; values were not printed. Eight migrations already applied; no reset, seed or migration application performed.
- Private full DB archive `.wrangler/pre-010.dump` created before tests; SHA-256 `7F33E3F8C1A9DD04CF987706ECDA720AA0D5D6497312168FAA999E79488968BE`. This is an unencrypted, local recovery aid, excluded from Git; it is not off-site or a full Storage/Auth/config recovery proof.
- Every existing public table's sorted row-content fingerprint and Auth identity fingerprint matched before/after integration and HTTPS checks. Temporary integration fixtures were cleaned; the HTTPS smoke removes only the exact guest session it created. Existing orders, checks, settlements and admin UUID preserved. Password value/hash was never fetched or logged; only the `password_set` boolean was checked.
- `admin@menuflow.com` had no password. Its local recovery/setup helper was refreshed for the same configured UUID; no replacement account or email was created/sent. Open `http://127.0.0.1:5208` on the PC and set the password privately, then `http://127.0.0.1:5198/login`. Link lasts one hour; activation session ten minutes. Do not record the link or password. Expiry is not an application failure: rerun the same local helper only when needed.
- Bootstrap now verifies the configured UUID/email before any invite/recovery side effect. A deliberate wrong-address invocation failed before issuing a link. Existing first-install behavior remains when no UUID is configured.
- CareerOS and unrelated cloud projects were not modified. No push, deployment, paid resource, new cloud account, real onboarding or real customer data processing occurred.

## Firewall and phone evidence

Effective Windows rule `MenuFlow-Local-Supabase-Block-LAN`: enabled, inbound Block, TCP 55431 and 55432, all profiles, WiFi adapter, any remote address. Firewall profiles enabled. Docker still publishes these ports broadly, so keep the blocking rule. API/Auth health works locally.

The user reported **both addresses failed to open on the same-WiFi phone**: `http://192.168.1.104:55431/auth/v1/health` and `http://192.168.1.104:55432`. This is user-reported reachability evidence, not an agent-run TCP probe, IPv6 test or proof across future adapter changes. Recheck after network/firewall changes. No LAN listener or firewall allow rule was enabled. Full physical QR/order/settlement testing remains pending.

## HTTPS options researched

1. **Chosen product path: Cloudflare Pages + private service-bound Worker + separate Supabase Free staging.** Stable HTTPS origin for frontend, `/api`, QR and activation. Public menu needs no customer account. Staff login stays protected. Cloud Storage signed image URLs use HTTPS. Do not reuse the local Supabase endpoint, local admin UUID or unrelated cloud data. Existing `deploy/*.staging.json` and `*.pilot.json` package this topology with new orders disabled. Their dry runs pass; they have not been deployed.
2. **Temporary remote rehearsal:** current Cloudflare Quick Tunnels can restrict access to exact emails using `cloudflared tunnel --url <local-origin> --allowed-mail <operator-email>`, without a Cloudflare account. OTP access is an operator test gate, not the public customer's login model. Random hostname changes per run; camera fragment handoff/cookies/activation must be rechecked. It publishes an endpoint, so explicit user approval is still required. No tunnel was started or tool downloaded. The existing localhost Vite/Supabase image and scheme configuration must not be blindly tunneled.
3. **Optional local TLS diagnostic implemented:** `prepare-phone-certificate.ps1`, `phone-pilot.mjs`, `phone-pilot-lib.mjs`, `test-local-https.mjs`. Production-built frontend + exact API handlers under one HTTPS origin, narrow signed-image GET bridge, Secure/HttpOnly/SameSite=Strict cookies, strict Origin/Host checks, fixed local Supabase destination and no broad Auth/REST/DB forwarding. No origin rewriting or CORS wildcard. This is a Node adapter, not a Cloudflare-runtime/performance or phone test.

Local TLS defaults to `127.0.0.1:5443`, expires after one hour, does not log requests, and accepts no forwarded identity headers. Certificates/keys remain ignored in `.wrangler/phone-010`; directory ACL is limited to current Windows user and SYSTEM. CA signing key exists only during generation and is discarded; server key persists privately. Leaf expires after two days and CA after three. No trust store was changed. Its separate optional LAN mode requires explicit real-phone port confirmation, phone allowlist and effective firewall verification; it was **not enabled** and is not required for the chosen internet staging path.

Developer reproduction (PowerShell 7.4+, not customer instructions):

```powershell
./scripts/prepare-phone-certificate.ps1 -ComputerIP <private-PC-IPv4>
npm run build
npm run local:https
# another terminal, trusted CA and hostname verification enabled:
npm run test:local:https
```

Certificate creation refuses to overwrite an existing trust identity. No `rejectUnauthorized:false`, browser certificate bypass, machine root installation or whole-Supabase proxy is used. If an optional local phone diagnostic is ever selected, transfer only `menuflow-phone-ca.cer` by a trusted channel, compare its SHA-256, install/enable trust manually, and remove it after the diagnostic. Never transfer `server-key.pem`. Internet staging uses normal browser trust and needs none of these steps.

## Verification

| Check | Result |
|---|---|
| Lint + TypeScript + Vite production build | Passed |
| Unit/API/security regressions | 125 passed, including signed-image proxy target rejection |
| Desktop + Pixel 7 browser emulation | 52 passed |
| Real local Supabase integration | 5 passed: tenant/guest isolation, approval/activation/revocation, orders, concurrent settlement and visit separation |
| Isolated PostgreSQL/security/concurrency/restore suite | Passed, including financial immutability and logical restore comparison |
| Local security/performance advisors | No issues |
| Worker and staging/pilot package dry runs | Passed; local only |
| Dependency audit | 0 vulnerabilities |
| Real TLS HTTP client, certificate trust/hostname verified | Passed: live sample menu + signed images, secure guest cookie, unauthorized platform, bad Host/Origin/spoofed forwarded headers and broad proxy rejection |
| Wrong admin bootstrap address | Rejected before invitation; identity fingerprints preserved |
| Physical phone port block | Both unreachable, user reported |
| Physical QR → order → panel → check → paid/closed | **Not performed** |
| Hosted CPU, quota, SMTP, full disaster restore | **Not performed** |

Initial local diagnostic failures were fixed before counting success: certificate constructor needed explicit .NET cryptography types; TypeScript needed the helper declaration; image path validation needed the application's tenant/product/file layout. The bad-Host test initially failed TLS hostname verification before reaching HTTP; it now verifies the valid localhost TLS name while separately sending an invalid Host. No failed attempt is counted as a pass.

## Internet staging readiness and approvals

Read-only connected Supabase inventory has no project named MenuFlow; no project data was queried or changed. Cloudflare account/project availability and actual free-plan usage are not established. An organization and region must be selected by the user before creating a separate Free project; existing unrelated projects must not be repurposed. Staging/pilot may consume both free project slots. Do not silently upgrade or create a paid branch. No new cloud account is authorized.

Before publication, obtain explicit permission for **a new Free MenuFlow Supabase staging resource in the selected existing organization, and an internet-accessible Cloudflare Pages staging endpoint with synthetic data only**. Identify the accounts and quote the actual cost before creation; stop if the plan requires payment. This approval does not authorize real restaurant onboarding or processing real customer data. GitHub push requires a separate yes. A protected temporary tunnel is a distinct, optional approval, not automatically authorized by preparing its command.

On approved staging:

1. Record Supabase region/ref, Cloudflare account/project, exact stable HTTPS origin, operator and release commit. Keep automatic Git deployment/preview exposure disabled until intentionally configured. Worker remains `workers_dev:false`, `preview_urls:false`, no public routes; Pages calls it through `MENUFLOW_API`.
2. Use least-privilege provider tokens. Upload the two server-only Supabase keys and verified staging admin UUID through secure secret entry; no Git, VITE, logs or clipboard reports. Local and staging identities are independent; preserve the local admin. Check rate-limit namespaces against account-wide collisions. Keep `ORDERING_DISABLED=true` until synthetic acceptance.
3. Apply the eight reviewed migrations to the confirmed **new** target; verify history, grants, all exposed-table RLS, private schema exclusion, private 300 KB Storage bucket, service-only guest RPCs and two-tenant/guest isolation. Never reset the existing local DB or copy its credentials into the cloud.
4. Auth Site URL and allowed redirect must be the exact approved HTTPS origin/activation path, without wildcard production callbacks. The current app exchanges a token hash server-side; inspect camera/fragment clearing and Strict cookie behavior on real browsers. CORS remains same-origin. Test real invitation/reset delivery; built-in SMTP is not a production delivery guarantee.
5. Use fictional business/staff data. Create the table QR on this final origin; do not rotate the preserved local QR. Stage menu/private signed image access, then explicitly enable synthetic order acceptance for the bounded test. Verify Secure/HttpOnly/Strict cookies, 401/403/429/503, revoked QR and stale membership.
6. Assign operator and quota/error dashboards before service. Record route class/status/UTC/request ID only; never bodies, tokens, QR fragments, cookies, contacts or notes. Logging remains off in deployment configs until a privacy-reviewed observer is available. A liveness 200 alone is not readiness.
7. Snapshot release versions, secret/binding names and migration history. Emergency stop is `ORDERING_DISABLED=true`, then finish/reconcile existing orders. Roll back Pages and Worker only to a schema-compatible pair; use forward fixes for table-check migrations. Never delete settlement records or blindly restore over active service.

## Free-plan, backup and privacy gates

Official limits reviewed on 18 October 2026: Workers Free 100,000 requests/day, 10 ms CPU/invocation; Supabase Free 500 MB database, 1 GB Storage, 50k MAU, 5 GB uncached plus separate 5 GB cached egress. Actual account sharing/usage must be checked. Free inactivity pause and absence of included managed daily backup/PITR remain operational risks, not a reason to add paid resources silently.

Start real pilot only after separate approval: one restaurant, four tables, one visible panel, up to five active guests, four hours. Existing polling estimate is 10,800 API calls; reserve 21,600 for both hops plus other traffic, then measure actual counters/CPU. At 70% budget stop expansion; at 85%, service failure, repeated 429, >1% 5xx/5 minutes or >5-second panel lag stop new orders and use manual reconciliation. No automated alert is claimed.

Before real data, complete [backup/restore](backup-restore.md): encrypted off-device DB + Auth UUID/config + Storage bytes/hash manifest, named owner, 24-hour RPO target, measured RTO and full new-target restoration. The passing synthetic logical DB restore does not establish full managed Supabase disaster recovery.

KVKK release gate remains with responsible parties: controller/contact, purposes/legal basis, processors/regions, international transfers, retention/deletion, note minimization and rights/support process. Use synthetic notes only until resolved; this is not a legal compliance claim. Existing [pilot operations](pilot-operations.md), [deployment checklist](deployment-007.md) and [restaurant/device matrix](restaurant-pilot-007.md) still apply.

Sources: [Cloudflare Quick Tunnels/email gate](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/), [Workers limits](https://developers.cloudflare.com/workers/platform/limits/), [Supabase billing](https://supabase.com/docs/guides/platform/billing-on-supabase), [Supabase pricing](https://supabase.com/pricing), [backup scope](https://supabase.com/docs/guides/platform/backups), [Auth redirect allowlist](https://supabase.com/docs/guides/auth/redirect-urls), [local certificate trust precautions](https://github.com/FiloSottile/mkcert), [10 November legacy TLS cipher removal](https://supabase.com/changelog/cbc-tls-ciphers-deprecated). Changelog markdown was fetched directly and relevant TLS notice reviewed. No SDK feature change was needed.

## User acceptance steps

1. **Done, user reported:** same-WiFi phone cannot open Supabase 55431/55432.
2. On the PC, set the existing admin password at `http://127.0.0.1:5208`, then sign in through `http://127.0.0.1:5198/login`. Never share the password or activation URL in chat.
3. Approve/choose the free internet staging account/organization and publication scope; GitHub push is a separate approval. No customer IP is required.
4. After staging exists, scan its printed synthetic QR on Android Chrome/iPhone Safari over WiFi and cellular. Confirm business/table/prices/photos; place one synthetic order; check the staff panel; move it through delivery; verify the table total; record a simulated physical payment and close the check. Verify a fresh scan opens a new visit and the old guest cannot add to it. Do not charge a real customer.
5. Record OS/browser/network/time/release/result/request ID without secrets. Full recovery, privacy/SMTP/monitoring and explicit real-restaurant approval must pass before onboarding.
