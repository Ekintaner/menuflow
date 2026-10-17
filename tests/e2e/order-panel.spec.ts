import { test, expect, type Page } from "@playwright/test";
const tenant = "10000000-0000-0000-0000-000000000001",
  table = "10000000-0000-0000-0000-000000000002",
  id = "10000000-0000-0000-0000-000000000003";
async function setup(page: Page, owner = false, conflict = false) {
  let status = "pending_acceptance",
    version = 1,
    mode = "manual",
    enabled = true,
    reads = 0,
    revoked = false;
  const requests: string[] = [];
  await page.route("**/api/v1/**", async (route) => {
    const req = route.request(),
      url = new URL(req.url()),
      path = url.pathname;
    requests.push(req.url());
    if (path.endsWith("/memberships"))
      return route.fulfill({
        json: [
          {
            tenant_id: tenant,
            role: owner ? "owner" : "staff",
            tenants: { name: "Test Kafe", currency: "TRY" },
          },
        ],
      });
    if (path.endsWith("/categories")) return route.fulfill({ json: [] });
    if (path.endsWith("/tables"))
      return route.fulfill({ json: [{ id: table, name: "Masa 8" }] });
    if (path.endsWith("/settings")) {
      if (req.method() === "PATCH") {
        const b = req.postDataJSON();
        expect(b.version).toBe(1);
        mode = b.acceptance_mode;
        enabled = b.ordering_enabled;
      }
      return route.fulfill({
        json: { acceptance_mode: mode, ordering_enabled: enabled, version: 1 },
      });
    }
    if (path.endsWith("/transitions")) {
      const b = req.postDataJSON();
      expect(b.version).toBe(version);
      if (["rejected", "cancelled"].includes(b.status) && !b.reason.trim())
        return route.fulfill({
          status: 422,
          json: { message: "Ret veya iptal gerekçesi gerekli." },
        });
      if (conflict) {
        status = "accepted";
        version++;
        return route.fulfill({
          status: 409,
          json: { message: "Sipariş değişti. Listeyi yenileyin." },
        });
      }
      status = b.status;
      version++;
      return route.fulfill({ json: { id, status, version } });
    }
    const order = {
      id,
      table_id: table,
      status,
      version,
      note: "Az şekerli",
      total_minor: 1250,
      currency: "TRY",
      created_at: "2026-10-18T00:00:00.123456Z",
      dining_tables: { name: "Masa 8" },
      order_items: [
        { product_name: "Kahve", quantity: 1, line_total_minor: 1250 },
      ],
      order_events: [
        {
          id: "event-1",
          to_status: status,
          reason: status === "rejected" ? "Ürün bitti" : null,
          created_at: "2026-10-18T00:00:00Z",
        },
      ],
    };
    if (path.endsWith("/orders")) {
      reads++;
      if (revoked)
        return route.fulfill({
          status: 403,
          json: { message: "Aktif işletme yetkisi gerekli." },
        });
      const history = ["served", "rejected", "cancelled"].includes(status);
      const filtered =
        (url.searchParams.get("status") === "history") !== history;
      return route.fulfill({
        json: { items: filtered ? [] : [order], next_cursor: null },
      });
    }
    if (path.endsWith("/" + id)) return route.fulfill({ json: order });
    return route.fulfill({
      status: 404,
      json: { message: "Unknown endpoint" },
    });
  });
  await page.goto("/admin");
  await page.getByRole("button", { name: "Siparişler", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Masa 8", exact: true }),
  ).toBeVisible();
  return {
    requests,
    get reads() {
      return reads;
    },
    revoke() {
      revoked = true;
    },
  };
}
test("staff accepts, prepares and serves with guest-compatible statuses and history", async ({
  page,
}) => {
  await setup(page);
  await expect(
    page.getByRole("button", { name: "Kabul ayarlarını kaydet" }),
  ).toHaveCount(0);
  for (const [value, label] of [
    ["accepted", "Kabul edildi"],
    ["preparing", "Hazırlanıyor"],
    ["ready", "Hazır"],
    ["served", "Teslim edildi"],
  ]) {
    await page
      .getByLabel("Yeni durum " + id.slice(0, 8), { exact: true })
      .selectOption(value);
    await page
      .getByRole("button", {
        name: "Durumu kaydet " + id.slice(0, 8),
        exact: true,
      })
      .click();
    if (value !== "served")
      await expect(
        page.getByRole("heading", { name: new RegExp(label) }),
      ).toBeVisible();
  }
  await expect(
    page.getByText("Sipariş bulunamadı.", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("Durum filtresi").selectOption("history");
  await expect(
    page.getByRole("heading", { name: /Teslim edildi/ }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /Durumu kaydet/ })).toHaveCount(
    0,
  );
  await page
    .getByRole("button", { name: "Ayrıntı " + id.slice(0, 8), exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Sipariş geçmişi" }),
  ).toContainText("Teslim edildi");
  await page.screenshot({
    path: `test-results/order-panel-${test.info().project.name}.png`,
    fullPage: true,
  });
});
test("rejection requires reason and moves to history", async ({ page }) => {
  await setup(page);
  await page
    .getByLabel("Yeni durum " + id.slice(0, 8), { exact: true })
    .selectOption("rejected");
  await page
    .getByRole("button", {
      name: "Durumu kaydet " + id.slice(0, 8),
      exact: true,
    })
    .click();
  await expect(page.getByRole("alert")).toContainText("gerekçesi gerekli");
  await page
    .getByLabel("Gerekçe " + id.slice(0, 8), { exact: true })
    .fill("Ürün bitti");
  await page
    .getByRole("button", {
      name: "Durumu kaydet " + id.slice(0, 8),
      exact: true,
    })
    .click();
  await page.getByLabel("Durum filtresi").selectOption("history");
  await expect(page.getByRole("heading", { name: /Reddedildi/ })).toBeVisible();
});
test("competing write shows conflict and reloads current state", async ({
  page,
}) => {
  await setup(page, false, true);
  await page
    .getByRole("button", {
      name: "Durumu kaydet " + id.slice(0, 8),
      exact: true,
    })
    .click();
  await expect(page.getByRole("alert")).toContainText("Sipariş değişti");
  await expect(
    page.getByRole("heading", { name: /Kabul edildi/ }),
  ).toBeVisible();
});
test("owner manages acceptance with explicit behavior and sends filters", async ({
  page,
}) => {
  const state = await setup(page, true);
  await page
    .getByLabel("Kabul modu", { exact: true })
    .selectOption("automatic");
  await expect(page.getByText(/QR paylaşılabilir/)).toBeVisible();
  await page.getByRole("button", { name: "Kabul ayarlarını kaydet" }).click();
  await expect(page.getByText(/Geçerli mod: Otomatik/)).toBeVisible();
  await page.getByLabel("Masa filtresi").selectOption(table);
  await page.getByLabel("Başlangıç", { exact: true }).fill("2026-10-17T00:00");
  await expect
    .poll(() =>
      state.requests.some(
        (u) => u.includes("from=") && u.includes("table=" + table),
      ),
    )
    .toBe(true);
});
test("polls at bounded interval and stops showing data on revocation", async ({
  page,
}) => {
  await page.clock.install();
  const state = await setup(page);
  const before = state.reads;
  await page.clock.fastForward(5100);
  await expect.poll(() => state.reads).toBeGreaterThan(before);
  await page.evaluate(() =>
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: true,
    }),
  );
  const hiddenReads = state.reads;
  await page.clock.fastForward(31000);
  expect(state.reads).toBe(hiddenReads);
  await page.evaluate(() =>
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: false,
    }),
  );
  await page.clock.fastForward(31000);
  await expect.poll(() => state.reads).toBeGreaterThan(hiddenReads);
  state.revoke();
  await page.clock.fastForward(5100);
  await expect(page.getByRole("alert")).toContainText("Aktif işletme yetkisi");
  await expect(
    page.getByRole("heading", { name: "Masa 8", exact: true }),
  ).toHaveCount(0);
  const stopped = state.reads;
  await page.clock.fastForward(60000);
  expect(state.reads).toBe(stopped);
});
