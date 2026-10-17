import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
test("platform demo creates a restaurant, adds tables and downloads a labelled QR", async ({
  page,
}) => {
  await page.goto("/platform-demo");
  await expect(page.getByText(/Örnek ortam/)).toBeVisible();
  await page.getByLabel("İşletme adı", { exact: true }).fill("Örnek Lokanta");
  await page.getByLabel("Kısa ad", { exact: true }).fill("ornek-lokanta");
  await page.getByLabel("Başlangıç masa sayısı").fill("3");
  await page.getByRole("button", { name: "Restoranı oluştur" }).click();
  await expect(
    page.getByRole("button", { name: "Örnek Lokanta · 3 masa" }),
  ).toBeVisible();
  await page.getByLabel("Eklenecek masa", { exact: true }).fill("2");
  await page.getByRole("button", { name: "Masa ekle", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Örnek Lokanta · 5 masa" }),
  ).toBeVisible();
  page.on("dialog", (d) => d.accept());
  await page
    .getByRole("button", { name: "Masa 1 QR oluştur / yenile", exact: true })
    .click();
  await expect(
    page.getByRole("img", { name: "Örnek Lokanta, Masa 1 QR kodu" }),
  ).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "PNG indir" }).click();
  expect((await download).suggestedFilename()).toBe("demo-Masa 1-qr.png");
  await page.emulateMedia({ media: "print" });
  await expect(
    page.getByRole("heading", { name: "Restoranlar ve masalar." }),
  ).toBeHidden();
  await expect(
    page.getByRole("img", { name: "Örnek Lokanta, Masa 1 QR kodu" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "PNG indir" })).toBeHidden();
  await page.emulateMedia({ media: "screen" });
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(result.violations).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "MenuFlow Demo Kafe · 4 masa" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Örnek Lokanta · 5 masa" }),
  ).toHaveCount(0);
});
test("restaurant owner cannot open the platform console", async ({ page }) => {
  await page.route("**/api/v1/platform/**", (route) =>
    route.fulfill({
      status: 403,
      contentType: "application/json",
      body: JSON.stringify({
        message: "Bu hesap platform yönetimine yetkili değil.",
      }),
    }),
  );
  await page.goto("/platform");
  await expect(page.getByRole("alert")).toContainText("yetkili değil");
  await expect(
    page.getByRole("heading", { name: "Yalnız platform yöneticisi" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Restoranı oluştur" }),
  ).toHaveCount(0);
});
