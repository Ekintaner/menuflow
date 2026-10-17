import { test, expect } from "@playwright/test";
const tenant = "10000000-0000-0000-0000-000000000001";
const category = "10000000-0000-0000-0000-000000000002";
const product = "10000000-0000-0000-0000-000000000003";
const table = "10000000-0000-0000-0000-000000000004";
test("owner publishes category/product and downloads table QR", async ({
  page,
}) => {
  let loggedIn = false;
  const rows: Record<string, Record<string, unknown>[]> = {
    categories: [],
    products: [],
    tables: [],
    staff: [],
  };
  await page.route("**/api/v1/**", async (route) => {
    const req = route.request(),
      url = new URL(req.url()),
      path = url.pathname.replace("/api/v1", "");
    if (path === "/auth/login") {
      loggedIn = true;
      return route.fulfill({ json: { authenticated: true } });
    }
    if (path === "/admin/memberships")
      return route.fulfill(
        loggedIn
          ? {
              json: [
                {
                  tenant_id: tenant,
                  role: "owner",
                  tenants: { name: "Test Kafe", currency: "TRY" },
                },
              ],
            }
          : { status: 401, json: { message: "Giriş gerekli" } },
      );
    if (path === "/admin/publish")
      return route.fulfill({ json: { menu_published: true } });
    if (path.endsWith("/qr"))
      return route.fulfill({
        json: { url: `http://127.0.0.1:5198/menu#${"a".repeat(64)}` },
      });
    if (path.endsWith("/image"))
      return route.fulfill({ json: { image_path: "test-image" } });
    const resource = path.split("/")[2];
    if (rows[resource]) {
      if (req.method() === "POST") {
        const b = req.postDataJSON();
        if (resource === "products") expect(b.price_minor).toBe(12345);
        const id =
          resource === "categories"
            ? category
            : resource === "products"
              ? product
              : table;
        rows[resource].push({ ...b, id, archived_at: null });
        return route.fulfill({ status: 201, json: { ...b, id } });
      }
      if (req.method() === "PATCH") {
        Object.assign(rows[resource][0], req.postDataJSON());
        return route.fulfill({ json: rows[resource][0] });
      }
      return route.fulfill({ json: rows[resource] });
    }
    return route.fulfill({
      status: 404,
      json: { message: "Unknown endpoint" },
    });
  });
  await page.goto("/admin");
  await page.getByLabel("E-posta").fill("owner@example.test");
  await page.getByLabel("Parola", { exact: true }).fill("example-password");
  await page.getByRole("button", { name: "Giriş yap" }).click();
  await expect(page.getByLabel("İşletme", { exact: true })).toContainText(
    "Test Kafe",
  );
  await page.getByLabel("Ad", { exact: true }).fill("İçecekler");
  await page.getByRole("button", { name: "Kaydet", exact: true }).click();
  await expect(page.getByRole("heading", { name: "İçecekler" })).toBeVisible();
  await page.getByRole("button", { name: "Ürünler", exact: true }).click();
  await page.getByLabel("Ad", { exact: true }).fill("Türk kahvesi");
  await page.getByLabel("Açıklama").fill("Taze çekilmiş");
  await page.getByLabel("Fiyat (TRY)").fill("123,45");
  await page.getByRole("button", { name: "Kaydet", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Türk kahvesi" }),
  ).toBeVisible();
  await page
    .getByLabel("Görsel yükle Türk kahvesi")
    .setInputFiles({
      name: "coffee.png",
      mimeType: "image/png",
      buffer: Buffer.from("test image"),
    });
  await expect(page.getByRole("status")).toContainText("Görsel kaydedildi");
  await page.getByRole("button", { name: "Masalar", exact: true }).click();
  await page.getByLabel("Ad", { exact: true }).fill("Masa 8");
  await page.getByRole("button", { name: "Kaydet", exact: true }).click();
  await page
    .getByRole("button", { name: "QR oluştur / yenile Masa 8" })
    .click();
  await expect(page.getByAltText("Masaya özel QR")).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "QR indir", exact: true }).click();
  expect((await download).suggestedFilename()).toBe("menuflow-qr.png");
  await page
    .getByRole("button", { name: "Menüyü yayımla", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Menü yayımlandı");
  await page.screenshot({
    path: `test-results/admin-${test.info().project.name}.png`,
    fullPage: true,
  });
});
test("QR fragment is removed and correct tenant/table menu is displayed", async ({
  page,
}) => {
  await page.route("**/api/v1/menu", async (route) => {
    if (route.request().method() === "POST")
      expect(route.request().postDataJSON()).toEqual({ token: "a".repeat(64) });
    await route.fulfill({
      json: {
        tenant: { name: "Sahil Kafe", currency: "TRY" },
        table: { name: "Masa 8" },
        categories: [{ id: category, name: "İçecekler" }],
        products: [
          {
            id: product,
            name: "Türk kahvesi",
            category_id: category,
            price_minor: 12345,
            available: false,
          },
        ],
      },
    });
  });
  await page.goto(`/menu#${"a".repeat(64)}`);
  await expect(page.getByRole("heading", { name: "Menümüz" })).toBeVisible();
  await expect(page.getByText("Sahil Kafe · Masa 8")).toBeVisible();
  await expect(page.getByText("Şu an mevcut değil")).toBeVisible();
  expect(page.url()).not.toContain("#");
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Türk kahvesi" }),
  ).toBeVisible();
  await page.screenshot({
    path: `test-results/menu-${test.info().project.name}.png`,
    fullPage: true,
  });
});
test("invalid QR shows actionable error", async ({ page }) => {
  await page.route("**/api/v1/menu", (route) =>
    route.fulfill({
      status: 404,
      json: { message: "QR geçersiz veya masa kapalı. Yeni QR kodunu okutun." },
    }),
  );
  await page.goto(`/menu#${"f".repeat(64)}`);
  await expect(page.getByRole("alert")).toContainText("Yeni QR kodunu okutun");
  expect(page.url()).not.toContain("#");
});
test("staff sees read-only management", async ({ page }) => {
  await page.route("**/api/v1/**", (route) =>
    route.fulfill({
      json: route.request().url().includes("/memberships")
        ? [
            {
              tenant_id: tenant,
              role: "staff",
              tenants: { name: "Test Kafe", currency: "TRY" },
            },
          ]
        : [{ id: category, name: "İçecekler" }],
    }),
  );
  await page.goto("/admin");
  await expect(
    page.getByText("Çalışan hesabı: menü ve masa kayıtları salt okunur."),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Kaydet", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Menüyü yayımla", exact: true }),
  ).toHaveCount(0);
});
