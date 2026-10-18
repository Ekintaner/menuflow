import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
const tenant = "10000000-0000-0000-0000-000000000001";
const check = "20000000-0000-0000-0000-000000000001";
test("registration requests access without collecting a password", async ({
  page,
}) => {
  await page.route("**/api/v1/auth/registration", async (route) => {
    expect(route.request().postDataJSON()).toEqual({
      applicant_name: "Deniz",
      email: "deniz@example.test",
      business_name: "Kıyı Kahve",
      phone: "",
    });
    await route.fulfill({
      status: 202,
      json: { message: "Başvurunuz alındı. Yönetici onayı bekleniyor." },
    });
  });
  await page.goto("/register");
  await expect(page.locator('input[type="password"]')).toHaveCount(0);
  await page.getByLabel("Adınız").fill("Deniz");
  await page.getByLabel("E-posta").fill("deniz@example.test");
  await page.getByLabel("İşletme adı").fill("Kıyı Kahve");
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.getByRole("button", { name: "Başvuruyu gönder" }).click();
  await expect(page.getByRole("status")).toContainText("Yönetici onayı");
});
test("activation exchanges fragment once and requires matching private password", async ({
  page,
}) => {
  let exchanges = 0;
  await page.route("**/api/v1/auth/activation-session", async (route) => {
    exchanges++;
    await route.fulfill({ json: { ready: true } });
  });
  await page.route("**/api/v1/auth/activate", async (route) => {
    expect(route.request().postDataJSON()).toEqual({
      password: "Test-only-password!",
    });
    await route.fulfill({ json: { activated: true } });
  });
  await page.goto("/activate#token_hash=" + "a".repeat(56) + "&type=invite");
  await expect(page.getByLabel("Yeni parola")).toBeVisible();
  await expect(page).toHaveURL(/\/activate$/);
  expect(exchanges).toBe(1);
  await page.getByLabel("Yeni parola").fill("Test-only-password!");
  await page.getByLabel("Parola tekrarı").fill("Different-password!");
  await page.getByRole("button", { name: "Hesabı etkinleştir" }).click();
  await expect(page.getByRole("alert")).toContainText("eşleşmiyor");
  await page.getByLabel("Parola tekrarı").fill("Test-only-password!");
  await page.getByRole("button", { name: "Hesabı etkinleştir" }).click();
  await expect(page.getByRole("status")).toContainText("Hesabınız hazır");
});
test("staff inspects server bill and retries uncertain settlement with identical key", async ({
  page,
}) => {
  let paid = false;
  const attempts: { key: string | undefined; body: unknown }[] = [];
  const bill = () => ({
    id: check,
    table_name: "Masa 5",
    state: paid ? "closed" : "open",
    payment_status: paid ? "paid" : "unpaid",
    total_minor: 51000,
    currency: "TRY",
    version: 1,
    opened_at: new Date().toISOString(),
    orders: [
      {
        id: tenant,
        status: "served",
        total_minor: 51000,
        items: [
          {
            id: tenant,
            product_name: "Kahve",
            unit_price_minor: 12000,
            quantity: 2,
            line_total_minor: 24000,
          },
        ],
      },
    ],
    settlements: paid ? [{ action: "pay", amount_minor: 51000 }] : [],
  });
  await page.route("**/api/v1/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("memberships"))
      return route.fulfill({
        json: [
          {
            tenant_id: tenant,
            role: "staff",
            tenants: { name: "Kıyı Kahve", currency: "TRY" },
          },
        ],
      });
    if (url.pathname.endsWith("/settle")) {
      attempts.push({
        key: route.request().headers()["idempotency-key"],
        body: route.request().postDataJSON(),
      });
      if (attempts.length === 1) {
        paid = true;
        return route.abort();
      }
      return route.fulfill({ json: { action: "pay" } });
    }
    if (url.pathname.endsWith("/checks/" + check))
      return route.fulfill({ json: bill() });
    if (url.pathname.endsWith("/checks")) {
      if (url.searchParams.has("history"))
        return route.fulfill({
          json: [{ ...bill(), settled_total_minor: 51000 }],
        });
      return route.fulfill({
        json: [
          {
            id: tenant,
            name: "Masa 5",
            active: true,
            check_id: paid ? null : check,
            total_minor: paid ? 0 : 51000,
            active_orders: 0,
            currency: "TRY",
          },
        ],
      });
    }
    return route.fulfill({ json: [] });
  });
  await page.goto("/admin");
  await page.getByRole("button", { name: "Adisyonlar", exact: true }).click();
  await page.getByRole("button", { name: "Masa 5 adisyonunu aç" }).click();
  await expect(page.getByLabel("Adisyon ayrıntısı")).toContainText("510,00");
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  page.on("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "Ödeme alındı, adisyonu kapat" })
    .click();
  await expect(
    page.getByRole("button", { name: "Aynı tahsilatı tekrar kontrol et" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Aynı tahsilatı tekrar kontrol et" })
    .click();
  await expect(page.getByLabel("Adisyon ayrıntısı")).toContainText(
    "Kapalı · Ödendi",
  );
  expect(attempts).toHaveLength(2);
  expect(attempts[0]).toEqual(attempts[1]);
  await page
    .getByRole("button", { name: "Geçmiş adisyonlar", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: /Masa 5 ·.*Ödendi/ }),
  ).toBeVisible();
});
test("public menu contains no management or authentication navigation", async ({
  page,
}) => {
  await page.route("**/api/v1/**", (route) =>
    route.fulfill({
      json: route.request().url().includes("guest-sessions")
        ? {}
        : {
            tenant: { name: "Kıyı Kahve", currency: "TRY" },
            table: { name: "Masa 5" },
            version: 1,
            session_id: tenant,
            ordering_enabled: true,
            categories: [{ id: tenant, name: "Kahveler" }],
            products: [
              {
                id: check,
                category_id: tenant,
                name: "Filtre kahve",
                description: "Günlük kavrulmuş çekirdekler.",
                price_minor: 12000,
                available: true,
              },
            ],
          },
    }),
  );
  await page.goto("/menu#" + "b".repeat(64));
  await expect(
    page.getByRole("heading", { name: "Kıyı Kahve", exact: true }),
  ).toBeVisible();
  await expect(
    page.locator(
      'a[href*="login"], a[href*="register"], a[href*="admin"], input[type="password"]',
    ),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Filtre kahve ekle" }).click();
  await expect(page.getByLabel("Sepet", { exact: true })).toContainText(
    "Filtre kahve × 1",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("local proxy preserves trusted, foreign and missing Origin distinctions", async ({
  request,
}) => {
  const trusted = await request.post("/api/v1/guest-sessions", {
    headers: { Origin: "http://127.0.0.1:5198" },
    data: { token: "invalid" },
  });
  expect([401, 503]).toContain(trusted.status());
  const foreign = await request.post("/api/v1/guest-sessions", {
    headers: { Origin: "https://untrusted.example" },
    data: { token: "invalid" },
  });
  expect(foreign.status()).toBe(403);
  const missing = await request.post("/api/v1/guest-sessions", {
    data: { token: "invalid" },
  });
  expect(missing.status()).toBe(403);
});
