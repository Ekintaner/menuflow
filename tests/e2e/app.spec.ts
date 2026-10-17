import { test, expect } from "@playwright/test";
test("customer demo cart and admin navigation", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Küçük bir mola",
  );
  await page.getByRole("button", { name: "Filtre kahve ekle" }).click();
  await expect(page.getByRole("complementary")).toContainText(
    "Filtre kahve × 1",
  );
  await expect(
    page.getByRole("button", { name: "Sipariş yakında" }),
  ).toBeDisabled();
  await page.getByRole("link", { name: "Yönetim" }).click();
  await expect(
    page.getByRole("heading", { name: "Panel girişi" }),
  ).toBeVisible();
  await expect(page.getByLabel("E-posta")).toBeVisible();
});
test("same-origin API proxy and Origin protection for orders", async ({
  request,
}) => {
  const health = await request.get("/api/v1/health");
  expect(health.ok()).toBeTruthy();
  expect(await health.json()).toMatchObject({ status: "ok" });
  const order = await request.post("/api/v1/orders", {
    data: { tenant_id: "forged", total: 1 },
  });
  expect(order.status()).toBe(403);
});
