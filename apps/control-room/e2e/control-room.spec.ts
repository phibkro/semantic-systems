import { expect, test } from "@playwright/test";
import { createHash } from "node:crypto";
import { readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

async function expectedObservationLabel(): Promise<"Local preview" | "Main CI assertion"> {
  const data = path.resolve(import.meta.dirname, "../dist/data");
  const version = JSON.parse(await readFile(path.join(data, "version.json"), "utf8")) as {
    snapshot: string;
  };
  const snapshot = JSON.parse(await readFile(path.join(data, version.snapshot), "utf8")) as {
    metadata: { observation_source: string };
  };
  if (snapshot.metadata.observation_source === "local_preview") return "Local preview";
  if (snapshot.metadata.observation_source === "main_ci_assertion") return "Main CI assertion";
  throw new Error(`unexpected observation source: ${snapshot.metadata.observation_source}`);
}

test("phone viewport exposes five views, search, drilldown, and provenance", async ({ page }) => {
  await page.goto(".");

  await expect(page.getByRole("heading", { name: "Control Room" })).toBeVisible();
  for (const name of ["Pulse", "Systems", "Semantics", "Evidence", "Work"]) {
    await expect(page.getByRole("button", { name, exact: true })).toBeVisible();
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

  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Work", exact: true }).click();
  const frontier = page.getByRole("region", { name: "Canonical work frontier" });
  await expect(frontier.getByRole("heading", { name: /Ready frontier \(\d+\)/ })).toBeVisible();
  await expect(
    frontier.getByRole("heading", { name: /Scheduler-blocked work \(\d+\)/ }),
  ).toBeVisible();
  await expect(frontier.getByRole("button").first()).toBeVisible();
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
    icons: Array<{ sizes: string; src: string; type: string }>;
    start_url: string;
  };
  expect(manifest.display).toBe("standalone");
  for (const size of ["192x192", "512x512"]) {
    const icon = manifest.icons.find(
      (candidate) => candidate.sizes === size && candidate.type === "image/png",
    );
    expect(icon, `manifest must contain a ${size} PNG icon`).toBeDefined();
    const response = await request.get(
      new URL(icon!.src, "http://127.0.0.1:4173/semantic-systems/").href,
    );
    expect(response.ok()).toBeTruthy();
    expect(response.headers()["content-type"]).toContain("image/png");
  }
  expect(manifest.start_url).toBe(".");

  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect
    .poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null))
    .toBeTruthy();
});

test("a newer complete snapshot becomes visible, applies atomically, and cannot roll back", async ({
  page,
}) => {
  const data = path.resolve(import.meta.dirname, "../dist/data");
  const versionPath = path.join(data, "version.json");
  const originalVersionText = await readFile(versionPath, "utf8");
  const originalVersion = JSON.parse(originalVersionText) as {
    snapshot: string;
  };
  const originalSnapshotText = await readFile(path.join(data, originalVersion.snapshot), "utf8");
  const next = JSON.parse(originalSnapshotText) as {
    metadata: { digest: string; generated_at: string; observed_at: string };
  };
  const nextObservedAt = "2099-07-29T12:00:00Z";
  next.metadata.generated_at = nextObservedAt;
  next.metadata.observed_at = nextObservedAt;
  next.metadata.digest = "";
  const digest = createHash("sha256")
    .update(`${stableStringify(next)}\n`, "utf8")
    .digest("hex");
  next.metadata.digest = digest;
  const nextName = `snapshot.${digest}.json`;
  const nextPath = path.join(data, nextName);
  const nextVersion = {
    schema_version: "semantic-public-version-v1",
    commit: (next as { metadata: { commit: string } }).metadata.commit,
    digest,
    observed_at: nextObservedAt,
    snapshot: nextName,
  };

  try {
    await page.goto(".");
    await expect(page.getByText(await expectedObservationLabel(), { exact: true })).toBeVisible();
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });

    await writeFile(nextPath, `${stableStringify(next)}\n`);
    await writeFile(versionPath, `${stableStringify(nextVersion)}\n`);

    await page.getByRole("button", { name: "Refresh snapshot" }).click();
    await expect(page.getByText("Update available", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Apply" }).click();
    await expect(page.getByText(nextObservedAt, { exact: true })).toBeVisible();

    await writeFile(versionPath, originalVersionText);
    await page.getByRole("button", { name: "Refresh snapshot" }).click();
    await expect(page.getByText(nextObservedAt, { exact: true })).toBeVisible();
    await expect(page.getByText("Update available", { exact: true })).not.toBeVisible();
  } finally {
    await writeFile(versionPath, originalVersionText);
    await rm(nextPath, { force: true });
  }
});

test("installed shell visibly uses the last valid snapshot offline", async ({ context, page }) => {
  await page.goto(".");
  await expect(page.getByText(await expectedObservationLabel(), { exact: true })).toBeVisible();
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
