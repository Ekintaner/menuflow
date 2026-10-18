import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
for (const destination of ["/platform", "/admin"]) {
  test(`one login routes to ${destination} using server permissions`, async ({
    page,
  }) => {
    const tenant = "10000000-0000-0000-0000-000000000001";
    await page.route("**/api/v1/**", (route) => {
      const url = route.request().url();
      if (url.endsWith("/auth/session"))
        return route.fulfill({
          status: 401,
          json: { message: "Giriş gerekli" },
        });
      if (url.endsWith("/auth/login")) {
        expect(route.request().postDataJSON()).toEqual({
          email: "panel@example.test",
          password: "test-password",
        });
        return route.fulfill({ json: { authenticated: true, destination } });
      }
      if (url.includes("/platform/registrations"))
        return route.fulfill({ json: { requests: [], next: null } });
      if (url.endsWith("/platform/restaurants"))
        return route.fulfill({ json: { restaurants: [], next: null } });
      if (url.endsWith("/admin/memberships"))
        return route.fulfill({
          json: [
            {
              tenant_id: tenant,
              role: "owner",
              tenants: { name: "Test Kafe", currency: "TRY" },
            },
          ],
        });
      return route.fulfill({ json: [] });
    });
    await page.goto("/login");
    await expect(
      page.getByRole("heading", { name: "Panel girişi" }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /Kayıt ol|Üye ol/ }),
    ).toHaveAttribute("href", "/register");
    const axe = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(axe.violations).toEqual([]);
    await page
      .getByLabel("E-posta", { exact: true })
      .fill("panel@example.test");
    await page.getByLabel("Parola", { exact: true }).fill("test-password");
    await page.getByRole("button", { name: "Giriş yap", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${destination}$`));
    if (destination === "/platform")
      await expect(
        page.getByRole("heading", { name: "Restoranlar ve masalar." }),
      ).toBeVisible();
    else {
      await expect(page.getByLabel("İşletme", { exact: true })).toContainText(
        "Test Kafe",
      );
      await expect(
        page.getByRole("button", { name: "Çalışanlar", exact: true }),
      ).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: "Üyelik ver", exact: true }),
      ).toHaveCount(0);
    }
  });
}
test("platform demo owns account and membership controls", async ({ page }) => {
  await page.goto("/platform-demo");
  await page.getByLabel("Hesap e-postası").fill("ornek@example.test");
  await page
    .getByLabel("İlk parola", { exact: true })
    .fill("Sample-only-12345");
  await page.getByLabel("Yeni hesap rolü").selectOption("staff");
  await page.getByRole("button", { name: "Hesap ve üyelik oluştur" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Örnek üyelik eklendi" }),
  ).toBeVisible();
  await expect(
    page.getByRole("listitem").filter({ hasText: "ornek@example.test" }),
  ).toContainText("Aktif");
  await page
    .getByRole("button", {
      name: "Üyeliği kapat ornek@example.test",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("listitem").filter({ hasText: "ornek@example.test" }),
  ).toContainText("Pasif");
  await expect(page.getByLabel("İlk parola", { exact: true })).toHaveValue("");
});
