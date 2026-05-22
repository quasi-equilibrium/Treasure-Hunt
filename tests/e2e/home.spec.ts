import { expect, test } from "@playwright/test";

test("mobile smoke flow reaches hider setup", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Treasure Hunt" })).toBeVisible();

  await page.getByRole("button", { name: /Saklayan/ }).click();
  await expect(page.getByText("Anahtar Sayısı")).toBeVisible();
  await expect(page.getByRole("button", { name: "Oyunu Kur" })).toBeEnabled();
});

test("three-digit room code can be joined in the same origin", async ({ context, page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Saklayan/ }).click();
  await page.getByRole("button", { name: "Oyunu Kur" }).click();

  const roomCode = (await page.locator(".code-card strong").innerText()).trim();
  expect(roomCode).toMatch(/^[1-9][0-9]{2}$/);

  const seeker = await context.newPage();
  await seeker.goto("/");
  await seeker.getByRole("button", { name: /Bulan/ }).click();
  await seeker.locator("#join-code").fill(roomCode);
  await expect(seeker.getByRole("button", { name: "Oyuna Katıl" })).toBeEnabled();
  await seeker.getByRole("button", { name: "Oyuna Katıl" }).click();

  await expect(seeker.locator(".room-header")).toContainText("Bulan");
  await expect(seeker.locator(".room-header")).toContainText(roomCode);
});
