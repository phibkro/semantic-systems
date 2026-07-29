import { expect, test } from "@playwright/test";

test("phone viewport exposes five views, search, drilldown, and provenance", async ({ page }) => {
  await page.goto(".");

  await expect(page.getByRole("heading", { name: "Control Room" })).toBeVisible();
  for (const name of ["Pulse", "Systems", "Semantics", "Evidence", "Work"]) {
    await expect(page.getByRole("button", { name })).toBeVisible();
  }

  await page.getByRole("button", { name: "Systems" }).click();
  await page.getByRole("searchbox", { name: "Search systems" }).fill("explorer");
  const result = page.getByRole("button", { name: /Semantic project explorer/ });
  await expect(result).toBeVisible();
  await result.click();
  await expect(page.getByRole("dialog")).toContainText("Incoming relations");
  await expect(
    page.getByRole("link", { name: "Open canonical source at exact commit" }),
  ).toHaveAttribute("href", /\/blob\/[0-9a-f]{40}\/model\//);
});

test("manifest and service worker operate at the Pages base path", async ({ page, request }) => {
  await page.goto(".");
  const manifestLink = await page.locator('link[rel="manifest"]').getAttribute("href");
  expect(manifestLink).toContain("/semantic-systems/");

  const manifestResponse = await request.get(
    "http://127.0.0.1:4173/semantic-systems/manifest.webmanifest",
  );
  expect(manifestResponse.ok()).toBeTruthy();
  const manifest = (await manifestResponse.json()) as {
    display: string;
    icons: unknown[];
    start_url: string;
  };
  expect(manifest.display).toBe("standalone");
  expect(manifest.icons.length).toBeGreaterThan(0);
  expect(manifest.start_url).toBe(".");

  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect
    .poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null))
    .toBeTruthy();
});

test("installed shell visibly uses the last valid snapshot offline", async ({ context, page }) => {
  await page.goto(".");
  await expect(page.getByText("Current", { exact: true })).toBeVisible();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await context.setOffline(true);
  await page.reload();

  await expect(page.getByText("Offline", { exact: true })).toBeVisible();
  await expect(page.getByText("Control Room", { exact: true })).toBeVisible();
  await expect(page.getByText(/Using the last valid snapshot/)).toBeVisible();
});
