# CODEX-009 — System Restart & Real-World Pilot Preparation

18 October 2026. Local baseline: `8185025`, branch `main`, initially clean and equal to local `origin/main`. No fetch/push/deployment/account creation or paid service was performed. Remote CI success is inherited context, not a newly executed remote check. CareerOS was not started or modified.

## Restart and preservation

Docker Desktop 4.91 failed before starting its engine: stale AF_UNIX endpoints in `%LOCALAPPDATA%/Docker/run` and `%LOCALAPPDATA%/docker-secrets-engine` returned Windows error 1920. Individual endpoint rename and read-only reparse inspection failed. With Docker processes stopped, these **runtime directories only** were renamed to timestamped `*.codex009-backup-*` siblings and empty runtime directories created. A subsequent named-pipe access error cleared after waiting for all Docker processes to exit before starting Desktop. No Docker factory reset, disk/volume deletion, WSL unregister, DB reset, seed, or migration application occurred. The runtime backups remain on this machine; never apply this procedure to Docker's data directory or VHDX. Related upstream report: [Docker Desktop issue 554](https://github.com/docker/desktop-feedback/issues/554).

The existing five `menuflow-local` containers recovered; the documented command confirmed their startup:

```sh
npx supabase start -x realtime,imgproxy,mailpit,postgres-meta,studio,edge-runtime,logflare,vector,supavisor
npm run dev
```

All eight migrations were already applied, including both CODEX-008 migrations. `.dev.vars` contains the four required names; values were never printed. The URL is exactly the dedicated local API, and the configured platform UUID was resolved server-side to `admin@menuflow.com`. Frontend has no VITE secret configuration. Git ignores the environment, local sample manifest, runtime state, logs and test outputs.

Before integration tests, a 570,774-byte full local database archive was saved privately as `.wrangler/pre-009.dump`. This local file is not encrypted by this task, not an off-site backup, and not a full Storage/managed Auth recovery guarantee. It is excluded from Git and deliverables. Existing admin, complete tenant rows, orders and checks had identical fingerprints before/after integration tests. The original sample retained one tenant, one order, one check and no settlements. Tests provisioned and cleaned their own random fixtures only.

The existing admin had no password set. The documented bootstrap helper issued a private activation handoff for the **same UUID**, without creating a replacement identity or choosing a password. It wrote only ignored local configuration. It sends no email. Open the setup page below and choose the password privately. The helper lasts one hour; after exchanging the one-time link, the activation cookie lasts ten minutes. Do not copy links/tokens into reports or screenshots. Recovery changes invitation state intentionally; the identity/data preservation fingerprint above was checked before this handoff.

## Local entry points

| URL | Verified behavior |
|---|---|
| `http://127.0.0.1:5198/login` | Shared login UI, 200; admin actual login awaits the user's password |
| `http://127.0.0.1:5198/admin` | Restaurant UI, 200; protected data requires active membership |
| `http://127.0.0.1:5198/platform` | Platform UI, 200; anonymous overview API returns 401 |
| `http://127.0.0.1:5198/register` | Application UI, 200; does not create an account by itself |
| `http://127.0.0.1:5208` | Private local password setup; bearer link is only in helper memory |
| `http://127.0.0.1:5208/menu` | Existing Kıyı Kahve/Masa 5 QR shortcut, 302 without printing its capability |
| `http://127.0.0.1:5198/api/v1/health` | 200 JSON through Vite proxy |
| `http://127.0.0.1:8798/api/v1/health` | 200 JSON directly from Worker |
| `http://127.0.0.1:55431/auth/v1/health` | Supabase Auth; checked separately from Worker liveness |

Frontend, Worker and setup/shortcut listeners remain loopback. The **existing Supabase Docker bindings publish 55431/55432 on all IPv4/IPv6 interfaces**. Windows Public firewall is enabled, but external reachability was not tested and loopback isolation is not established for these two ports. An attempt to add an inbound block scoped to active network interfaces was denied by Windows (not elevated); no rule was applied. Before LAN rehearsal, run the following in an elevated PowerShell, then verify local health and confirm a second device cannot reach these ports. This blocks incoming physical-network access while leaving the loopback application path available; recheck after changing adapters. Do not stop or modify unrelated projects.

```powershell
New-NetFirewallRule -Name 'MenuFlow-Local-Supabase-Block-LAN' -DisplayName 'MenuFlow local Supabase - block LAN access' -Direction Inbound -Action Block -Protocol TCP -LocalPort 55431,55432 -InterfaceAlias @(Get-NetConnectionProfile | Select-Object -ExpandProperty InterfaceAlias) -Profile Any
```

Health is liveness, not proof of database authorization. The actual sample menu was additionally loaded in mobile Chromium through Vite, Wrangler and Supabase: business/product headings, loaded private signed images, fragment removal, and protected API/Origin rejection were verified. It did not place an order on the preserved sample.

New `npm run local:menu` serves just the existing sample shortcut on 5208, with strict Host/method checks, no-store/no-referrer/CSP and no credential logging. It reads the existing manifest and never contacts Auth or creates data. Use it for subsequent restarts when a password setup is **not** needed. Do not run it while the setup helper owns 5208. An unavailable sample returns 503; it never silently seeds one. To repeat password setup when required, stop the helper and use the documented `node scripts/bootstrap-admin.mjs admin@menuflow.com` procedure; do not use recovery as a routine restart step.

## Verification performed

| Check | Result |
|---|---|
| Lint and TypeScript/Vite build | Passed; lint rerun after new helper |
| Unit/API regression | 114 passed |
| Playwright desktop + Pixel 7 emulation | 52 passed; application/login/activation, order and table-check UI covered |
| Actual local Supabase integration | 5 passed: Auth/menu/images/QR isolation, platform provisioning, common login/revocation, concurrent table settlement/visit separation, application approval/activation/disablement |
| PostgreSQL security/concurrency/migration/restore | 350 PASS checks; isolated logical restore content/RLS comparison passed |
| Local migration list | 8/8 applied, none pending |
| Local DB security/performance advisors | No issues, exit 0 |
| Worker and staging/pilot packaging | `api:check` and `pilot:check` passed, local dry runs only |
| Dependency audit | 0 vulnerabilities |
| Actual development proxy | Anonymous platform 401; foreign and missing write Origin 403; unknown API 404 JSON |
| Menu shortcut | 302 and no-store verified; strict Host/method checks and unknown-route 404 reviewed in the new helper |

The initial E2E launch overlapped with starting another local Wrangler instance and hit SQLite runtime locking; that run failed and was not counted as success. Starting one persistent dev stack before rerunning resolved it; the subsequent 52 tests passed. No runtime database was deleted. Integration tests use a test HTTP adapter for real browser coverage and real Supabase, while the additional sample smoke used the actual Vite/Wrangler processes. Mocked UI E2E is not represented as live service testing.

Local synthetic 50-request measurement: 50 successes, p95 159 ms; mobile menu usable 119 ms; panel visibility 2.37 s. These are local unthrottled measurements, **not** Cloudflare CPU, internet latency, physical phone or free-plan capacity evidence.

## Real phone and QR plan — still pending

The current Wi-Fi profile is **Public**. No firewall rule, LAN listener, tunnel, router forwarding or certificate trust was added. Phone `127.0.0.1` points to the phone, not this PC. Existing printed localhost QR codes cannot work on another device.

1. Prefer an explicitly approved, protected HTTPS staging installation with synthetic data using [deployment-007.md](deployment-007.md). One stable origin serves menu, `/api`, login and activation; cloud Storage signed URLs must be HTTPS and reachable by phones. Keep pilot orders globally disabled until the acceptance gates pass. A tunnel is public exposure and is not a substitute for that approval.
2. For a controlled LAN rehearsal, first apply and verify the Supabase inbound restriction above, then use a trusted private Wi-Fi with no client isolation; choose this PC's adapter IPv4 (not a Docker/vEthernet address). Stop the existing frontend only, then run `npm run dev:web -- --host <PC-LAN-IP>`; Worker stays loopback and Supabase must remain blocked from the physical network. If a frontend firewall exception is needed, scope it to TCP 5198, Private profile, the testing subnet, and remove it after rehearsal. Do not change a public network's trust merely to suppress the firewall. There is no reason to expose DB 55432, Worker 8798 or the 5208 setup helper.
3. Plain LAN HTTP is limited to synthetic menu/connectivity work. It is not acceptable for real passwords or pilot traffic, and is not a production cookie/TLS test. Current local signed image URLs contain `127.0.0.1:55431`; they cannot load on a phone. Thus the LAN command alone is **not a fully functional pilot configuration**. Do not open the entire Supabase API to fix this. Full phone testing requires the approved HTTPS staging path, or a separately prepared trusted local HTTPS reverse proxy for frontend/API and narrowly scoped signed images with certificates trusted on both phones. Do not bypass certificate warnings or rewrite Origin checks.
4. Generate fresh synthetic table QR URLs on the chosen reachable frontend origin via the dashboard (or privately change only the origin in a test QR capability). Never rotate the preserved demo QR just for a screenshot. Include `/menu#TOKEN` exactly; preserve the fragment through the camera/browser handoff. Print a black-on-white QR with quiet zone, table label and human-readable business name. Validate the final printed code, not only a PNG preview.
5. On real iPhone Safari and Android Chrome, scan using the native Camera app and tap its link. This app has no in-page camera scanner; native camera scanning does not call the webpage's `getUserMedia`. If that capability is later introduced, [secure contexts](https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Secure_Contexts) and camera permission will matter. Verify fragment removal, table/business, prices/photos, quantity/cart, one order, dashboard state changes, bill accumulation, terminal-state physical settlement and history. Use the existing [device matrix](restaurant-pilot-007.md) plus the visit tests below.
6. Two phones at one table must have separate own-order access but one check. After settling, an old guest must not add to the next visit; rescanning creates the new visit. Test rejected/cancelled exclusions, duplicate settlement retry and history. Test network interruption during order submission, same-key retry, browser background/lock, QR revocation, changed price and disabled restaurant. Never confirm a real payment for this synthetic rehearsal.
7. Record OS/browser versions, network, UTC time, release commit, table label, outcome and request ID without tokens/cookies/customer notes. Test Wi-Fi and cellular only on authorized HTTPS staging; a LAN address cannot work on cellular. Actual printed QR, OS camera handoff, human accessibility and actual phone performance remain unperformed.

## Free pilot readiness checklist

Existing implementation and procedures were reviewed; the following cloud/human gates remain deliberately open. No cloud account was inspected, authenticated or changed.

| Gate | Local evidence / required before public pilot |
|---|---|
| Secrets and environments | Four local secret names set; server-only service role. Separate staging/pilot Supabase refs, exact verified admin UUID, restricted provider tokens and secure rotation/delivery must be confirmed on the approved accounts. No secrets in Pages/VITE/Git. |
| CORS / callbacks / cookies | Same-origin writes enforced through proxy; no permissive CORS added. Set Auth Site URL and exact approved HTTPS activation redirect in each environment, no wildcard production callbacks. Confirm Secure/HttpOnly/SameSite cookies and fragment exchange on the deployed topology. [Redirect guidance](https://supabase.com/docs/guides/auth/redirect-urls). |
| RLS / storage | Migration and security tests/advisors passed locally. Expose only public schema; private schema excluded; private 300 KB image bucket; membership checked live; service-only guest RPC; no user_metadata authorization. Re-run tenant/guest isolation and verify grants on staging. |
| Applications / invitations | Pending → approval → inactive owner → verified one-time activation → normal login passed on synthetic accounts. Actual recipient verification, secure invite delivery, SMTP/recovery and operator support still need evidence. Admin has not yet selected a local password. |
| Backup / restore | Local snapshot and isolated synthetic SQL restore passed. Assign backup owner, encrypted second location, retention, hashes, Auth UUID/config and Storage object manifest; prove full recovery to a new target. Free has no included automatic daily backup; DB backups do not contain Storage object bytes. [Supabase backups](https://supabase.com/docs/guides/platform/backups). |
| Quotas / availability | Official pages reviewed 18 Oct 2026: Workers Free 100,000 requests/day and 10 ms CPU/invocation; Supabase Free 2 active projects, 500 MB DB/project, 1 GB Storage, 50k MAU, 5 GB egress plus separate 5 GB cached egress; inactivity pause risk. Verify actual account usage/shared scope before committing slots; no paid upgrade. [Workers limits](https://developers.cloudflare.com/workers/platform/limits/), [Supabase pricing](https://supabase.com/pricing). |
| Traffic budget | Begin only after acceptance: one restaurant, four tables, one visible panel, at most five active guests for four hours. Existing estimate 10,800 polling calls, reserve 21,600 for two-hop topology plus headroom for other traffic. Measure both Worker hops' CPU and provider counters; local results are not capacity approval. Stop new participants at 70%, close orders at 85%/service failure. |
| Privacy / KVKK | Actual controller, contact, purpose/legal basis, recipients, retention/deletion process, subprocessors/regions and international-transfer assessment must be finalized with the responsible parties before real applications/orders. No invented privacy notice or claim of legal compliance. Notes may contain sensitive information; use synthetic notes only until the pilot policy is ready. See existing [privacy work list](restaurant-pilot-007.md#gizlilik-ve-kvkk-hazırlığı). |
| Rollback | Default `ORDERING_DISABLED=true`; restaurant unpublished/closed until accepted. Record compatible Pages/Worker/schema versions and secrets/bindings. Prefer forward fix; never restore CODEX-007 write behavior against CODEX-008 check schema or delete immutable settlements. Reconcile legacy/unpaid checks and physical receipts before reopening. DB restore is a separate approved maintenance operation. |
| Observability | API supplies no-store and request IDs; deployment configs keep request logging disabled to avoid accidental bearer/body capture. Before pilot assign operator, visible panel and error/quota dashboard; record only route class/status/time/request_id, never QR fragments, cookies, activation URLs, contact data or order notes. Prove 429 and 503 handling on staging; configure privacy-reviewed alerts if authorized. 5 min >1% 5xx, repeated 429, >5 s panel delay or 85% quota triggers stop/manual fallback. Monitoring is not currently automated. |
| Device / service changes | Real phone matrix and hosted CPU/latency remain open. Supabase's announced [10 Nov TLS cipher removal](https://supabase.com/changelog/cbc-tls-ciphers-deprecated) requires checking the actual oldest supported device's signed image requests; no code change was required for the current local stack. |

**Release decision: local system restored and automated gates passed; real-world/public pilot not approved or completed.** New GitHub push, cloud resources, deployment, fees and real onboarding require the user's explicit approval.
