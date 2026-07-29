#!/usr/bin/env bun
/**
 * Conformance check for the materialized Clamor `ConventionalCommits` block.
 *
 * The block has no safe apply interface (design spec 0005), so this project
 * hand-materializes its claims and records them in
 * `config/clamor-blocks/conventional-commits.provenance.json`. This script is
 * the derivation-strength "test" rung for that provenance: it recomputes each
 * exclusive-path claim's digest and re-reads each semantic-key claim from
 * `package.json`, then fails loudly on any drift between the checked-in
 * artifacts and the recorded provenance, or between the provenance and the
 * project's required commit-type policy.
 */
import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const provenancePath = resolve(root, "config/clamor-blocks/conventional-commits.provenance.json");

type ExclusivePathClaim = {
  claimId: string;
  path: string;
  kind: "exclusive_path";
  executable: boolean;
  contentDigest: string;
};

type SemanticKeyClaim = {
  claimId: string;
  path: string;
  kind: "semantic_key";
  key: string[];
  value: unknown;
};

type Provenance = {
  block: { name: string; version: string; digest: string };
  configuration: { allowedTypes: string[]; sourceGlobs: string[] };
  renderedClaims: Array<ExclusivePathClaim | SemanticKeyClaim>;
};

const REQUIRED_ALLOWED_TYPES = [
  "build",
  "chore",
  "ci",
  "docs",
  "feat",
  "fix",
  "perf",
  "refactor",
  "revert",
  "style",
  "test",
  "research",
  "design",
  "governance",
  "plans",
];

const digestOfText = (text: string): string =>
  `sha256:${createHash("sha256").update(text, "utf8").digest("hex")}`;

const problems: string[] = [];

if (!existsSync(provenancePath)) {
  console.error(`check-commit-policy: missing provenance record at ${provenancePath}`);
  process.exit(1);
}

const provenance = JSON.parse(readFileSync(provenancePath, "utf8")) as Provenance;

for (const type of REQUIRED_ALLOWED_TYPES) {
  if (!provenance.configuration.allowedTypes.includes(type)) {
    problems.push(
      `provenance configuration.allowedTypes is missing required type "${type}" (design spec 0005 requires the standard config-conventional types plus research, design, governance, plans).`,
    );
  }
}
for (const type of provenance.configuration.allowedTypes) {
  if (!REQUIRED_ALLOWED_TYPES.includes(type)) {
    problems.push(
      `provenance configuration.allowedTypes declares unexpected type "${type}" not in the required list.`,
    );
  }
}

let packageJson: Record<string, unknown> | undefined;
const readPackageJson = (): Record<string, unknown> => {
  packageJson ??= JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")) as Record<
    string,
    unknown
  >;
  return packageJson;
};

const readKeyPath = (obj: Record<string, unknown>, key: string[]): unknown => {
  let cursor: unknown = obj;
  for (const segment of key) {
    if (cursor === undefined || cursor === null || typeof cursor !== "object") {
      return undefined;
    }
    cursor = (cursor as Record<string, unknown>)[segment];
  }
  return cursor;
};

for (const claim of provenance.renderedClaims) {
  const artifactPath = resolve(root, claim.path);
  if (!existsSync(artifactPath)) {
    problems.push(`claim "${claim.claimId}" names ${claim.path}, which does not exist.`);
    continue;
  }

  if (claim.kind === "exclusive_path") {
    const text = readFileSync(artifactPath, "utf8");
    const actual = digestOfText(text);
    if (actual !== claim.contentDigest) {
      problems.push(
        `claim "${claim.claimId}" at ${claim.path} has drifted: recorded ${claim.contentDigest}, actual ${actual}.`,
      );
    }
    continue;
  }

  const actualValue = readKeyPath(readPackageJson(), claim.key);
  if (JSON.stringify(actualValue) !== JSON.stringify(claim.value)) {
    problems.push(
      `claim "${claim.claimId}" expects ${claim.path}#${claim.key.join(".")} = ${JSON.stringify(claim.value)}, found ${JSON.stringify(actualValue)}.`,
    );
  }
}

if (problems.length > 0) {
  console.error("check-commit-policy: materialized commit policy has drifted from provenance.");
  for (const problem of problems) {
    console.error(`  - ${problem}`);
  }
  process.exit(1);
}

console.log(
  `check-commit-policy: ${provenance.block.name}@${provenance.block.version} (${provenance.block.digest}) — ${provenance.renderedClaims.length} claims conform.`,
);
