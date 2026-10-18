# CODEX-008 — Public menu, checks and approved access

18 October 2026. Extends the existing React → same-origin Worker → Supabase architecture. This decision supersedes the CODEX-000 exclusion of shared table checks and adds an application form without enabling public Auth signup. No separate frontend, payment gateway or customer accounts were added.

## Experiences and authorization

- `/menu`: table QR fragment → validated anonymous `mf_guest` cookie → menu/cart/order/own-order tracking. No management navigation or login. Mobile cart dock, category anchors, product photography, price/quantity controls, error/loading/empty/unavailable states. Cookies and server state determine the table; browser state is never authority.
- `/login`: one email/password page. Verified configured Auth UUID routes to `/platform`; active owner/staff membership routes to `/admin`. Disabled/pending identities have no new restaurant access.
- `/admin`: existing menu/table/QR/order tools plus **Adisyonlar** floor, current check, line snapshots, cancellation exclusions, settlement and history. Membership issuance remains platform-only.
- `/platform`: existing restaurants/tables/QR/accounts/memberships plus application queue, approve/reject, activation reissue, operational counts, restaurant enable/disable and administrative audit.
- `/register`: contact application only. No password, account or membership is created by submission.
- `/activate`: Supabase verifies an administrator-issued one-time token, exchanges it for a short HttpOnly activation cookie and accepts the applicant's own password. This cookie grants no dashboard session; normal login follows activation.

`PLATFORM_ADMIN_USER_ID` is one exact server secret containing the verified Supabase Auth UUID. Email and editable user metadata never confer platform rights. Every privileged platform request calls Auth `getUser`; every tenant request checks live active membership and tenant state and uses the user's JWT with RLS. Origins must match for writes. Production still requires all deployment safety bindings. Vite's local proxy explicitly preserves Origin (including foreign and missing origins); it does not weaken the Worker's check.

## Migration 20261017233748_table_checks.sql

Adds `visit_version` to tables/guest sessions and `check_id` to every order. Adds `table_checks` and append-only `check_settlements`, tenant/table-aware composite FKs, one-open-check partial unique index, visit uniqueness and history/order indexes. All new tables force RLS. Staff read their tenant; direct financial writes are denied. A narrow private settlement definer is needed for the audited transaction; its exposed wrapper is an authenticated invoker and repeats live role checks. Guest order RPC remains service-only.

Existing orders are preserved and grouped into one explicitly **legacy visit 1 per table**. Previous served orders did not have payment records. Therefore a populated production database needs operator reconciliation of these legacy checks against actual receipts before enabling new orders. The migration does not invent historical payments.

New orders lock table → guest → menu/settings/product rows and bind to the current check inside the same transaction. Multiple guests share the visit. Closing a check locks table → check, calculates totals from immutable order snapshots and writes settlement, check closure, visit increment and actor audit atomically. Order transitions serialize on the check lock. Settlement deliberately does not lock order rows in reverse order, avoiding an order/check deadlock. Nonterminal orders prevent closure; cancelled/rejected totals are excluded.

`expected_total_minor` is only a stale-display guard; SQL independently calculates the amount. Same key/action/amount/reason replays one result, a competing settlement conflicts. An old guest cannot add to the next visit, even if its cookie has not expired. An old successful idempotency replay still returns its original order. Rescanning the same physical QR starts a new current-visit guest session. Closed checks cannot be modified through order transitions.

**Pay** means the employee explicitly confirms physical payment and closes the bill. No card data or online collection. **Void** only permits a zero total with a nonempty reason. Positive unpaid closure is not implemented. History retains paid and void distinctions. Amounts are integer minor units; API accepts only safe integers.

## Migration 20261017234007_registration_approvals.sql

Adds private `registration_requests` and `platform_audit_logs`: forced RLS, no anon/authenticated table access; only the verified platform backend can review. Unique lowercased email among pending/processing/approved requests gives non-enumerating duplicate responses. Requests are limited by hashed IP and hashed email; missing limiter fails closed.

Review uses a locked five-minute claim lease. Concurrent reviewers cannot create two restaurants. Approval creates a restaurant, settings, 1–100 tables and an **inactive** owner membership. Auth link creation and PostgreSQL are separate transactions: failure leaves no active membership, and expired claims can be retried. An orphan inactive Auth identity can be reused by recovery invitation; the code never deletes an account on an uncertain response.

The administrator receives an activation link, never a password. Link hash stays in the URL fragment until the browser exchanges it; it is then removed from the address. Only `invite`/`recovery` OTPs for an approved Auth UUID or the configured platform UUID are accepted. The ten-minute activation cookie is HttpOnly/SameSite=Strict/Secure on HTTPS. After password setup, the approved owner membership becomes active in an audited transaction. If password setup succeeds but activation fails, the user can retry while the activation session is valid. Expired/lost links can be reissued only for approved applications. Rejection requires a reason and never creates an Auth account.

Restaurant disablement is checked on existing sessions as well as login. Its reason and actor are recorded. Previous restaurant creation/table/QR/membership audit events are also included in the platform feed. Queue pages hold 50 entries; audit feed shows the latest 100, rather than a full audit export.

## New API contract

All paths below start with `/api/v1`. Existing guest/order/menu/table/member endpoints remain.

| Method | Path | Permission / behavior |
|---|---|---|
| GET | `/admin/checks?tenant=UUID` | Active member; floor totals from SQL |
| GET | `/admin/checks?tenant=UUID&history=true&cursor=ISO\|UUID` | Closed checks, 50 per page |
| GET | `/admin/checks/{id}?tenant=UUID` | Authorized details, items and settlements |
| POST | `/admin/checks/{id}/settle?tenant=UUID` | `Idempotency-Key`; `{version,action:"pay"\|"void",expected_total_minor,reason?}` |
| POST | `/auth/registration` | `{applicant_name,email,business_name,phone?}` → generic 202 |
| POST | `/auth/activation-session` | `{token_hash,type}` → verified short activation cookie |
| POST | `/auth/activate` | Activation cookie + `{password}`; no dashboard cookie issued |
| GET | `/platform/overview` | Platform UUID; restaurant/pending/open check counts |
| GET | `/platform/registrations?status=pending&after=UUID` | Platform UUID; paginated private queue |
| POST | `/platform/registrations/{id}/approve` | `{table_count}` → inactive membership + activation URL |
| POST | `/platform/registrations/{id}/reject` | `{reason}` → audited rejection |
| POST | `/platform/registrations/{id}/invite` | Approved request only; reissue activation URL |
| POST | `/platform/restaurants/{id}/state` | `{active,reason}`; audited enable/disable |
| GET | `/platform/audit` | Latest 100 platform audit entries; no passwords/links |

## Exact local administrator bootstrap

1. Start the dedicated `menuflow-local` stack and apply migrations. It must have API `http://127.0.0.1:55431`, not a shared/cloud stack.
2. From the repository run `node scripts/bootstrap-admin.mjs <your-email>`. The helper obtains keys from local CLI status, creates an invite (or recovery for the same identity), writes only gitignored `.dev.vars` and sets the exact Auth UUID. It refuses replacing an already configured different UUID. No password or bearer link is printed or written into tracked files. No email is sent.
3. Start/restart `npm run dev:api` and `npm run dev:web`. Open `http://127.0.0.1:5208` on this computer. The helper binds only loopback and serves a one-hour, in-memory setup handoff with no-store/CSP/no-referrer headers. Click through to the existing `/activate` screen and choose your password there. The verified activation session lasts ten minutes. If expired or refreshed before completion, rerun the helper to get a fresh link. Stop the previous helper before reusing its port.
4. Sign in at `http://127.0.0.1:5198/login`. The exact configured UUID reaches `/platform`. The fictional sample also grants that UUID owner access to its restaurant, so `/admin` can be opened after login.
5. `.dev.vars`, `.wrangler/` and all generated tokens remain ignored. The helper is local-only and is **not** a cloud provisioning command.

For an approved cloud installation, provision the actual identity through Supabase's trusted administrative process, verify the recipient through a secure channel, bind its exact UUID as a Worker secret, deliver a provider-generated one-time activation link privately, then let the user choose their own password. Never grant platform rights by email or user metadata. Rotate/revoke sessions if a link is exposed. No cloud changes have been made here.

## Local fictional sample and photos

After bootstrap, `node scripts/seed-demo-008.mjs` provisions only the dedicated local stack: Kıyı Kahve, six tables, six products, private Storage images and a table-5 QR. It never resets a completed sample. `.wrangler/demo-008.json` holds local sample capabilities and a short-lived sample-owner JWT, not a password; keep it private and delete it when no longer needed. Product/category/image operations use the actual owner JWT and policies. The setup helper's `/menu` shortcut redirects to the sample QR without printing its token. Sample prices include 2 coffees + cake + lemonade = **510 TRY**; this is fictional data, not a real restaurant onboarding.

Bundled demo images are local files; customers do not contact Unsplash. Product photos are illustrative, not representations of an actual business's food. Source/license:

- Coffee, Jakub Dziubak: https://unsplash.com/photos/gvPfi0hQzA0
- Cake, Victoria Shes: https://unsplash.com/photos/ByMlteHMuy8
- Unsplash License: https://unsplash.com/license (checked during implementation; free commercial download/use, attribution appreciated). No Unsplash+ asset used.

## Recovery, migration and pilot gates

Take a verified backup before applying the two migrations, pause incoming orders and reconcile legacy checks. Ship frontend/Worker/schema as one compatible version. Prefer a forward fix. Do not roll back to CODEX-007 write behavior against the new schema: old code does not know visit closure, but DB triggers must remain in place to protect closed checks. Do not delete settlement rows, remove RLS, re-enable tenant membership writes or mark bills paid to make a rollback succeed.

Backups now include checks, settlements, visit versions, applications and platform audit, along with order snapshots, identity UUIDs and private Storage objects. The isolated PostgreSQL restore drill compares check/settlement hashes in addition to prior content and RLS checks. A full managed Auth+Storage disaster recovery drill, real device trial, cloud capacity/latency, SMTP delivery and legal review are still pilot gates from CODEX-007.

Applications contain personal contact data. Before a real public pilot publish the controller's actual privacy notice, contact/purpose/retention/deletion policy, select/assess data regions and international transfers under applicable KVKK requirements, restrict operational logs, and verify the secure invitation delivery process. No claim of legal compliance is made by this code milestone. No external analytics/cookies or third-party trackers were introduced.

## Limits and remaining human actions

- The owner's administrator identity is provisioned **locally**; the owner must choose a password in the activation UI. No cloud account was created or authenticated.
- Invitations are generated but not emailed automatically. The administrator must verify the intended recipient and deliver the link securely; automatic SMTP needs explicit future setup.
- Rate limits are configured Cloudflare bindings, not a global cross-region abuse ledger/CAPTCHA. Pilot traffic must be monitored.
- Table QR possession does not prove physical presence. Check closure invalidates the old visit for new orders, but a holder of the printed QR can rescan.
- Mobile/tablet browser emulation and automated accessibility checks do not replace testing a printed QR on actual phones or human accessibility review.
- No split bills, partial/refund payments, card processing, fiscal invoice/POS connection, subscription sales or audit export UI.
- Existing manually provisioned platform account controls are preserved; application-based onboarding uses the secure applicant-owned password flow.
- No public deployment, paid service, real restaurant onboarding or GitHub push is part of CODEX-008 delivery.
