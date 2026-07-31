import { describe, expect, test } from "vitest";
import {
  parseDeploymentStage,
  previewCleanupTarget,
  type PreviewDeployment,
} from "./deployment.ts";

describe("exact Alchemy deployment identities", () => {
  test.each([
    ["prod", "semantic.phibkro.org"],
    ["p1", "p1.semantic.phibkro.org"],
    ["p2147483647", "p2147483647.semantic.phibkro.org"],
  ])("maps %s to one exact domain", (stage, domain) => {
    expect(parseDeploymentStage(stage)).toEqual({
      kind: stage === "prod" ? "production" : "preview",
      stage,
      domain,
      url: `https://${domain}`,
    });
  });

  test.each([
    "",
    "dev",
    "p",
    "p0",
    "p01",
    "p-1",
    "pr-1",
    "p١",
    "p1/../prod",
    "p1\nprod",
    " p1",
    "p1 ",
    `p${"9".repeat(63)}`,
  ])("rejects malformed identity %j", (stage) => {
    expect(() => parseDeploymentStage(stage)).toThrow(/deployment stage/);
  });

  test("constructs cleanup authority only for a reparsed preview", () => {
    const preview = parseDeploymentStage("p42");
    if (preview.kind !== "preview") throw new Error("expected preview");
    expect(previewCleanupTarget(preview)).toEqual({ stage: "p42" });

    const production = parseDeploymentStage("prod");
    // @ts-expect-error production is intentionally unrepresentable
    expect(() => previewCleanupTarget(production)).toThrow(/preview deployment/);

    const forged = {
      kind: "preview",
      stage: "prod",
      domain: "semantic.phibkro.org",
      url: "https://semantic.phibkro.org",
    } as unknown as PreviewDeployment;
    expect(() => previewCleanupTarget(forged)).toThrow(/preview deployment/);
  });

  test("accepts the exact 63-octet DNS label boundary", () => {
    const stage = `p${"9".repeat(62)}`;
    expect(parseDeploymentStage(stage).stage).toBe(stage);
  });
});
