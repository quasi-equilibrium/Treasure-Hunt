import { expect, test } from "@playwright/test";

test("mobile smoke flow reaches hider setup", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Treasure Hunt" })).toBeVisible();

  await page.getByRole("button", { name: /Saklayan/ }).click();
  await expect(page.getByText("Anahtar Sayısı")).toBeVisible();
  await expect(page.getByRole("button", { name: "Oyunu Kur" })).toBeEnabled();
});
