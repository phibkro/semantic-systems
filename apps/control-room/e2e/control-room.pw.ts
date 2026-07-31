import { expect, test } from "@playwright/test";
import { createHash } from "node:crypto";
import { readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const dataRoot = path.resolve(import.meta.dirname, "../dist/data");

const compareCodeUnits = (left: string, right: string): number => {
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const difference = left.charCodeAt(index) - right.charCodeAt(index);
    if (difference !== 0) return difference;
  }
  return left.length - right.length;
};

const canonicalize = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => compareCodeUnits(left, right))
        .map(([key, item]) => [key, canonicalize(item)]),
    );
  }
  return value;
};

const canonical = (value: unknown): string => `${JSON.stringify(canonicalize(value))}\n`;

test("phone viewport exposes five views, search, drill-down, and exact provenance", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Control Room" })).toBeVisible();
  for (const name of ["Pulse", "Systems", "Semantics", "Evidence", "Work"]) {
    await expect(page.getByRole("button", { name, exact: true })).toBeVisible();
  }
  await expect(page.getByText("Local preview", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Systems" }).click();
  await page.getByRole("searchbox", { name: "Search systems" }).fill("explorer");
  const result = page.getByRole("button", { name: /Semantic project explorer/ });
  await expect(result).toBeVisible();
  await result.click();
  await expect(page.getByRole("dialog")).toContainText("Typed relations");
  await expect(
    page.getByRole("link", { name: "Open canonical source at exact commit" }),
  ).toHaveAttribute("href", /\/blob\/[0-9a-f]{40}\/model\//);
  await page.getByRole("button", { name: "Close details" }).click();
  await page.getByRole("button", { name: "Work", exact: true }).click();
  const frontier = page.getByRole("region", { name: "Canonical work frontier" });
  await expect(frontier.getByRole("heading", { name: /Ready frontier/ })).toBeVisible();
  await expect(frontier.getByRole("heading", { name: /Scheduler-blocked work/ })).toBeVisible();
});

test("root-base manifest and service worker install without caching mutable data", async ({
  page,
  request,
}) => {
  await page.goto("/");
  const manifestHref = await page.locator('link[rel="manifest"]').getAttribute("href");
  expect(manifestHref).toBe("/manifest.webmanifest");
  const manifestResponse = await request.get("/manifest.webmanifest");
  expect(manifestResponse.ok()).toBe(true);
  const manifest = (await manifestResponse.json()) as {
    readonly display: string;
    readonly start_url: string;
  };
  expect(manifest.display).toBe("standalone");
  expect(manifest.start_url).toBe(".");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect
    .poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null))
    .toBe(true);
});

test("N to N+1 applies atomically and an older version cannot roll back", async ({ page }) => {
  const versionPath = path.join(dataRoot, "version.json");
  const originalVersionText = await readFile(versionPath, "utf8");
  const originalVersion = JSON.parse(originalVersionText) as { readonly snapshot: string };
  const originalSnapshotText = await readFile(
    path.join(dataRoot, originalVersion.snapshot),
    "utf8",
  );
  const next = JSON.parse(originalSnapshotText) as {
    metadata: {
      commit: string;
      digest: string;
      generated_at: string;
      observed_at: string;
    };
  };
  const observedAt = "2099-07-31T12:00:00Z";
  next.metadata.generated_at = observedAt;
  next.metadata.observed_at = observedAt;
  next.metadata.digest = "";
  const digest = createHash("sha256").update(canonical(next), "utf8").digest("hex");
  next.metadata.digest = digest;
  const nextName = `snapshot.${digest}.json`;
  const nextPath = path.join(dataRoot, nextName);
  const nextVersion = {
    schema_version: "semantic-public-version-v1",
    commit: next.metadata.commit,
    digest,
    observed_at: observedAt,
    snapshot: nextName,
  };

  try {
    await page.goto("/");
    const originalObservedAt = (
      JSON.parse(originalSnapshotText) as { metadata: { observed_at: string } }
    ).metadata.observed_at;
    await expect(page.getByText(originalObservedAt, { exact: true })).toBeVisible();
    await writeFile(nextPath, canonical(next));
    await writeFile(versionPath, canonical(nextVersion));
    await page.getByRole("button", { name: "Refresh snapshot" }).click();
    await expect(page.getByText("Update available", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Apply" }).click();
    await expect(page.getByText(observedAt, { exact: true })).toBeVisible();

    await writeFile(versionPath, originalVersionText);
    await page.getByRole("button", { name: "Refresh snapshot" }).click();
    await expect(page.getByText(observedAt, { exact: true })).toBeVisible();
    await expect(page.getByText("Update available", { exact: true })).not.toBeVisible();
  } finally {
    await writeFile(versionPath, originalVersionText);
    await rm(nextPath, { force: true });
  }
});

test("invalid candidate never replaces last-known-valid state", async ({ page }) => {
  const versionPath = path.join(dataRoot, "version.json");
  const originalVersionText = await readFile(versionPath, "utf8");
  const originalVersion = JSON.parse(originalVersionText) as {
    readonly commit: string;
    readonly snapshot: string;
  };
  const originalSnapshot = JSON.parse(
    await readFile(path.join(dataRoot, originalVersion.snapshot), "utf8"),
  ) as { metadata: { digest: string; generated_at: string; observed_at: string } };
  const observedAt = "2098-07-31T12:00:00Z";
  const forged = structuredClone(originalSnapshot);
  forged.metadata.generated_at = observedAt;
  forged.metadata.observed_at = observedAt;
  forged.metadata.digest = "0".repeat(64);
  const forgedName = `snapshot.${forged.metadata.digest}.json`;
  const forgedPath = path.join(dataRoot, forgedName);
  try {
    await page.goto("/");
    const originalCommit = page.getByText(originalVersion.commit, { exact: true });
    await expect(originalCommit).toBeVisible();
    await writeFile(forgedPath, canonical(forged));
    await writeFile(
      versionPath,
      canonical({
        schema_version: "semantic-public-version-v1",
        commit: originalVersion.commit,
        digest: forged.metadata.digest,
        observed_at: observedAt,
        snapshot: forgedName,
      }),
    );
    await page.getByRole("button", { name: "Refresh snapshot" }).click();
    await expect(page.getByText("Invalid update rejected", { exact: true })).toBeVisible();
    await expect(originalCommit).toBeVisible();
  } finally {
    await writeFile(versionPath, originalVersionText);
    await rm(forgedPath, { force: true });
  }
});

test("installed shell visibly retains its digest-valid snapshot offline", async ({
  context,
  page,
}) => {
  await page.goto("/");
  await expect(page.getByText("Local preview", { exact: true })).toBeVisible();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByText("Offline", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Control Room" })).toBeVisible();
  await expect(page.getByText(/last valid snapshot/)).toBeVisible();
});
