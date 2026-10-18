import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { chromium, devices, expect } from "@playwright/test";

const dir = ".wrangler/staging-010-qnvsioxptgxrmoprlbbc/";
const fixture = JSON.parse(readFileSync(dir + "demo-manifest.json", "utf8"));
const { token } = JSON.parse(
  readFileSync(dir + "fixture-session.json", "utf8"),
);
const origin = "https://menuflow-web-staging.menuflow.workers.dev";
if (fixture.origin !== origin) throw Error("Wrong staging origin");
const cookie = "mf_admin=" + token;
async function call(
  path,
  cookie = "",
  data,
  method = "POST",
  key = randomUUID(),
) {
  const response = await fetch(origin + "/api/v1" + path, {
    method: data === undefined ? "GET" : method,
    headers: {
      Origin: origin,
      Cookie: cookie,
      "Content-Type": "application/json",
      "Idempotency-Key": key,
    },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    signal: AbortSignal.timeout(15000),
  });
  return response;
}
assert.equal((await call("/health")).status, 200);
assert.equal((await call("/platform/overview")).status, 401);
assert.equal((await call("/auth/session", cookie)).status, 200);
const blocked = await call("/auth/registration", "", {});
assert.equal(blocked.status, 503);
assert.equal((await blocked.json()).code, "STAGING_ONLY");
const foreign = await fetch(origin + "/api/v1/guest-sessions", {
  method: "POST",
  headers: { Origin: "https://evil.test", "Content-Type": "application/json" },
  body: "{}",
});
assert.equal(foreign.status, 403);
const unknown = await fetch(origin + "/api/does-not-exist");
assert.equal(unknown.status, 404);
assert.match(unknown.headers.get("content-type"), /application\/json/);
const assets = await fetch(origin + "/login");
assert.equal(assets.status, 200);
assert.match(assets.headers.get("x-robots-tag"), /noindex/);
if (process.argv.includes("--preflight")) {
  console.log(
    "PASS: hosted HTTPS, service binding, real operator session, anonymous denial, same-origin enforcement, staging registration block, API 404 and noindex.",
  );
  process.exit(0);
}
const browser = await chromium.launch();
try {
  const context = await browser.newContext({ ...devices["Pixel 7"] });
  const page = await context.newPage();
  await page.goto(origin + "/menu#" + fixture.tables[0].qr);
  await page
    .getByRole("heading", { name: "MenuFlow Test Kafe", exact: true })
    .waitFor();
  assert.equal(new URL(page.url()).hash, "");
  assert.ok(await page.getByText(/Test ortamı — gerçek sipariş/).isVisible());
  const photos = page.locator("img");
  assert.ok((await photos.count()) > 0);
  for (const img of await photos.all()) {
    await img.scrollIntoViewIfNeeded();
    await expect
      .poll(() => img.evaluate((el) => el.complete && el.naturalWidth > 0), {
        timeout: 15000,
      })
      .toBe(true);
  }
  const cookies = await context.cookies();
  const guest = cookies.find((c) => c.name === "mf_guest");
  assert.ok(guest?.secure && guest.httpOnly && guest.sameSite === "Strict");
  const guestCookie = "mf_guest=" + guest.value;
  let response = await call("/menu", guestCookie);
  assert.equal(response.status, 200);
  const menu = await response.json();
  const payload = {
    version: menu.version,
    session_id: menu.session_id,
    items: [
      { product_id: menu.products.find((p) => p.available).id, quantity: 1 },
    ],
    note: "CODEX-010 otomatik sentetik test; gerçek ödeme yok",
  };
  const key = randomUUID();
  response = await call("/orders", guestCookie, payload, "POST", key);
  assert.equal(response.status, 201);
  const order = await response.json();
  response = await call("/orders", guestCookie, payload, "POST", key);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).id, order.id);
  const isolated = await browser.newContext({ ...devices["Pixel 7"] });
  const second = await isolated.newPage();
  await second.goto(origin + "/menu#" + fixture.tables[0].qr);
  await second
    .getByRole("heading", { name: "MenuFlow Test Kafe", exact: true })
    .waitFor();
  const other = (await isolated.cookies()).find((c) => c.name === "mf_guest");
  assert.equal(
    (await call("/orders/" + order.id, "mf_guest=" + other.value)).status,
    404,
  );
  const listed = await call("/admin/orders?tenant=" + fixture.tenant, cookie);
  assert.equal(listed.status, 200);
  assert.ok(JSON.stringify(await listed.json()).includes(order.id));
  let version = 1;
  for (const status of ["accepted", "preparing", "ready", "served"]) {
    response = await call(
      `/admin/orders/${order.id}/transitions?tenant=${fixture.tenant}`,
      cookie,
      { version, status },
    );
    assert.equal(response.status, 200);
    const next = await response.json();
    version = next.version;
  }
  response = await call("/admin/checks?tenant=" + fixture.tenant, cookie);
  assert.equal(response.status, 200);
  const rows = await response.json();
  const row = rows.find((r) => r.id === fixture.tables[0].id);
  assert.ok(row?.check_id);
  const path = "/admin/checks/" + row.check_id + "?tenant=" + fixture.tenant;
  response = await call(path, cookie);
  assert.equal(response.status, 200);
  const bill = await response.json();
  assert.ok(bill.total_minor > 0);
  const settlement = {
    action: "pay",
    version: bill.version,
    expected_total_minor: bill.total_minor,
  };
  const payKey = randomUUID();
  response = await call(
    `/admin/checks/${row.check_id}/settle?tenant=${fixture.tenant}`,
    cookie,
    settlement,
    "POST",
    payKey,
  );
  assert.equal(response.status, 200);
  response = await call(
    `/admin/checks/${row.check_id}/settle?tenant=${fixture.tenant}`,
    cookie,
    settlement,
    "POST",
    payKey,
  );
  assert.equal(response.status, 200);
  response = await call(path, cookie);
  const closed = await response.json();
  assert.equal(closed.state, "closed");
  assert.equal(closed.payment_status, "paid");
  response = await call("/orders", guestCookie, payload);
  assert.equal(response.status, 401);
  const fresh = await browser.newContext({ ...devices["Pixel 7"] });
  const freshPage = await fresh.newPage();
  await freshPage.goto(origin + "/menu#" + fixture.tables[0].qr);
  await freshPage
    .getByRole("heading", { name: "MenuFlow Test Kafe", exact: true })
    .waitFor();
  await freshPage.screenshot({
    path: "C:/Users/Ekin Taner/Documents/Codex/2026-10-18/referenced-chatgpt-conversation-this-is-an-11/outputs/MenuFlow-staging-menu.png",
    fullPage: true,
  });
  writeFileSync(
    dir + "hosted-test-result.json",
    JSON.stringify({
      origin,
      checked_at: new Date().toISOString(),
      order: order.id,
      check: row.check_id,
      result: "passed",
      physical_phone_test: false,
      real_payment: false,
    }),
    { mode: 0o600 },
  );
  console.log(
    "PASS: real hosted HTTPS menu/photos, fragment clearing, Secure/HttpOnly/Strict cookie, order/retry, guest isolation, panel visibility, four transitions, check total, synthetic settlement/retry, old-visit rejection and fresh QR. Browser emulation only; no real payment or phone test.",
  );
} finally {
  await browser.close();
}
