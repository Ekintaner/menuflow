import { test, expect } from "@playwright/test";
const product = "40000000-0000-0000-0000-000000000001";
const menu = {
  tenant: { name: "Test Kafe", currency: "TRY" },
  table: { name: "Masa 4" },
  version: 1,
  session_id: product,
  ordering_enabled: true,
  categories: [{ id: product, name: "İçecekler" }],
  products: [
    {
      id: product,
      category_id: product,
      name: "Kahve",
      price_minor: 1250,
      available: true,
    },
  ],
};
const order = {
  id: product,
  number: "40000000",
  status: "pending_acceptance",
  total_minor: 2500,
  currency: "TRY",
  items: [{ product_name: "Kahve", quantity: 2 }],
};
test("QR → quantity → cart → real contract → own order tracking", async ({
  page,
}) => {
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("guest-sessions"))
      return route.fulfill({ status: 201, json: { created: true } });
    if (path.endsWith("/menu")) return route.fulfill({ json: menu });
    if (path.endsWith("/orders")) {
      expect(route.request().headers()["idempotency-key"]).toBeTruthy();
      expect(route.request().postDataJSON()).toEqual({
        version: 1,
        session_id: product,
        note: "Az sıcak",
        items: [{ product_id: product, quantity: 2 }],
      });
      return route.fulfill({ status: 201, json: order });
    }
    return route.fulfill({ json: order });
  });
  await page.goto(`/menu#${"a".repeat(64)}`);
  await page.getByRole("button", { name: "Kahve ekle" }).click();
  await page.getByRole("button", { name: "Kahve ekle" }).click();
  await page.getByRole("button", { name: "Kahve ekle" }).click();
  await page.getByRole("button", { name: "Kahve azalt" }).click();
  await expect(page.getByLabel("Sepet")).toContainText("Kahve × 2");
  await page.getByLabel("Sipariş notu").fill("Az sıcak");
  await page.screenshot({
    path: `test-results/order-cart-${test.info().project.name}.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: "Siparişi onayla ve gönder" }).click();
  await expect(page.getByRole("status")).toContainText(
    "işletmenin onayını bekliyor",
  );
  await page.reload();
  await expect(page.getByRole("status")).toContainText(
    "işletmenin onayını bekliyor",
  );
});
test("uncertain network result survives reload and retries identical key and payload", async ({
  page,
}) => {
  let attempt: { key: string; body: unknown } | undefined;
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("guest-sessions"))
      return route.fulfill({ status: 201, json: { created: true } });
    if (path.endsWith("/menu")) return route.fulfill({ json: menu });
    if (path.endsWith("/orders")) {
      const current = {
        key: route.request().headers()["idempotency-key"],
        body: route.request().postDataJSON(),
      };
      if (!attempt) {
        attempt = current;
        return route.abort("failed");
      }
      expect(current).toEqual(attempt);
      return route.fulfill({ json: order });
    }
    return route.fulfill({ json: order });
  });
  await page.goto(`/menu#${"a".repeat(64)}`);
  await page.getByRole("button", { name: "Kahve ekle" }).click();
  await page.getByRole("button", { name: "Siparişi onayla ve gönder" }).click();
  await expect(
    page.getByRole("button", { name: "Aynı gönderimi tekrar dene" }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Sepet")).toContainText("Kahve × 1");
  await page
    .getByRole("button", { name: "Aynı gönderimi tekrar dene" })
    .click();
  await expect(page.getByRole("status")).toContainText("onayını bekliyor");
});
test("menu change refreshes price and requires an explicit second confirmation", async ({
  page,
}) => {
  let changed = false,
    calls = 0;
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("guest-sessions"))
      return route.fulfill({ status: 201, json: { created: true } });
    if (path.endsWith("/menu"))
      return route.fulfill({
        json: {
          ...menu,
          version: changed ? 2 : 1,
          products: menu.products.map((p) => ({
            ...p,
            price_minor: changed ? 1500 : 1250,
          })),
        },
      });
    if (path.endsWith("/orders")) {
      calls++;
      if (!changed) {
        changed = true;
        return route.fulfill({
          status: 409,
          json: {
            code: "MENU_CHANGED",
            message:
              "Menü değişti. Güncel fiyatları kontrol edip tekrar onaylayın.",
          },
        });
      }
      expect(route.request().postDataJSON().version).toBe(2);
      return route.fulfill({ status: 201, json: order });
    }
    return route.fulfill({ json: order });
  });
  await page.goto(`/menu#${"a".repeat(64)}`);
  await page.getByRole("button", { name: "Kahve ekle" }).click();
  await page.getByRole("button", { name: "Siparişi onayla ve gönder" }).click();
  await expect(page.getByRole("alert")).toContainText("Menü değişti");
  await expect(page.getByLabel("Sepet")).toContainText("15,00");
  expect(calls).toBe(1);
  await page.getByRole("button", { name: "Siparişi onayla ve gönder" }).click();
  await expect(page.getByRole("status")).toContainText("onayını bekliyor");
});
