import { expect, test } from "@playwright/test";

async function mockDeviceApis(page: import("@playwright/test").Page) {
  await page.addInitScript(() => {
    class MockDeviceOrientationEvent extends Event {
      alpha: number | null;
      beta: number | null;
      gamma: number | null;
      webkitCompassHeading?: number;

      constructor(type: string, init: DeviceOrientationEventInit & { webkitCompassHeading?: number } = {}) {
        super(type);
        this.alpha = init.alpha ?? 0;
        this.beta = init.beta ?? 0;
        this.gamma = init.gamma ?? 0;
        this.webkitCompassHeading = init.webkitCompassHeading;
      }

      static async requestPermission() {
        return "granted" as PermissionState;
      }
    }

    class MockDeviceMotionEvent extends Event {
      static async requestPermission() {
        return "granted" as PermissionState;
      }
    }

    Object.defineProperty(window, "DeviceOrientationEvent", {
      configurable: true,
      value: MockDeviceOrientationEvent
    });
    Object.defineProperty(window, "DeviceMotionEvent", {
      configurable: true,
      value: MockDeviceMotionEvent
    });
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: async () => new MediaStream()
      }
    });
    Object.defineProperty(navigator, "vibrate", {
      configurable: true,
      value: () => true
    });
  });
}

test("mobile smoke flow reaches hider setup", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Treasure Hunt" })).toBeVisible();

  await page.getByRole("button", { name: /Saklayan/ }).click();
  await expect(page.getByText("Anahtar Sayısı")).toBeVisible();
  await expect(page.getByRole("button", { name: "Oyunu Kur" })).toBeEnabled();
});

test("seeker skips scanning and gets compass search UI", async ({ context, page }) => {
  await mockDeviceApis(page);
  await page.goto("/");
  await page.getByRole("button", { name: /Saklayan/ }).click();
  await page.getByRole("button", { name: "Oyunu Kur" }).click();
  const roomCode = (await page.locator(".code-card strong").innerText()).trim();

  const seeker = await context.newPage();
  await mockDeviceApis(seeker);
  await seeker.goto("/");
  await seeker.getByRole("button", { name: /Bulan/ }).click();
  await seeker.locator("#join-code").fill(roomCode);
  await seeker.getByRole("button", { name: "Oyuna Katıl" }).click();

  await page.getByRole("button", { name: "Hazırım, Başlayabiliriz" }).click();
  await seeker.getByRole("button", { name: "Hazırım, Başlayabiliriz" }).click();

  await page.getByRole("button", { name: "Kamera ve Sensörleri Aç" }).click();
  await seeker.getByRole("button", { name: "Kamera ve Sensörleri Aç" }).click();
  await expect(seeker.getByRole("button", { name: "Saklayan evi tarayacak" })).toBeVisible();

  await page.getByRole("button", { name: "Kalibre Et ve Evi Tara" }).click();
  await expect(seeker.getByRole("heading", { name: "Saklayan tarıyor" })).toBeVisible();
  await expect(seeker.getByText("Evi sen taramayacaksın")).toBeVisible();

  await expect(page.getByRole("button", { name: "Tarama Tamamlandı" })).toBeDisabled();
  await page.evaluate(() => (window as Window & { treasureHuntTest?: { forceScanComplete: () => void } }).treasureHuntTest?.forceScanComplete());
  await page.getByRole("button", { name: "Tarama Tamamlandı" }).click();
  await page.getByRole("button", { name: "Anahtarı Tara" }).click();
  await expect(page.locator(".key-anchor-marker")).toBeVisible();
  await expect(page.locator("#object-label")).toHaveCount(0);

  await page.getByRole("button", { name: "Sakladım, Bitir" }).click();
  await expect(seeker.locator(".seeker-compass")).toBeVisible();
  await expect(seeker.getByText("Mesafe")).toBeVisible();
  await seeker.getByRole("button", { name: "Aldım" }).click();
  await expect(seeker.getByText("Telefon dedektörü aktif")).toBeVisible();
  await expect(seeker.getByText("Titreşim")).toBeVisible();
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
