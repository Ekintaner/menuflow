import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { request } from "node:http";
import { chromium } from "@playwright/test";

const origin = "http://127.0.0.1:5210";
const file = ".wrangler/staging-010-qnvsioxptgxrmoprlbbc/server-secrets.json";
if (existsSync(file))
  throw Error("Setup already completed; do not submit test values.");
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  const initial = await page.goto(origin);
  assert.equal(initial.status(), 200);
  assert.equal(initial.headers()["referrer-policy"], "same-origin");
  assert.equal(initial.headers()["cache-control"], "no-store");
  await page.locator("#key").fill("invalid-test-only");
  const response = page.waitForResponse((r) => r.url() === origin + "/save");
  await page.getByRole("button", { name: "Güvenle kaydet" }).click();
  const submitted = await response;
  assert.equal(submitted.request().headers().origin, origin);
  assert.equal(submitted.status(), 303);
  await page.waitForURL(origin + "/result?state=invalid");
  assert.ok(
    (await page.locator("body").innerText()).includes(
      "Anahtar alanını kontrol",
    ),
  );
  await page.reload();
  assert.ok(
    (await page.locator("body").innerText()).includes(
      "Anahtar alanını kontrol",
    ),
  );
  assert.equal(await page.locator('input[type="password"]').count(), 0);
  for (const source of [undefined, "null", "https://evil.test"]) {
    const r = await fetch(origin + "/save", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        ...(source ? { Origin: source } : {}),
      },
      body: "key=invalid-test-only",
      redirect: "manual",
    });
    assert.equal(r.status, 403);
  }
  const status = await new Promise((resolve, reject) => {
    const req = request(origin, { headers: { Host: "evil.test" } }, (res) => {
      res.resume();
      resolve(res.statusCode);
    });
    req.on("error", reject);
    req.end();
  });
  assert.equal(status, 403);
  assert.equal(existsSync(file), false);
  console.log(
    "PASS: native browser form keeps its Origin; POST redirects to a readable reload-safe result; foreign/missing/null Origin and Host rejected; no credential read or saved.",
  );
} finally {
  await browser.close();
}
