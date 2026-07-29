#!/usr/bin/env bun
/**
 * Conformance check for the adapted Clamor `ConventionalCommits` materialization.
 *
 * Public CI cannot query the private Clamor checkout. It instead verifies that
 * this repository's artifacts, executable modes, configured inputs, immutable
 * upstream identity, and explicitly recorded local adaptations agree with one
 * checked provenance record. This establishes local conformance, not that
 * upstream was queried during this run.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve, sep } from "node:path";

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

type Adaptation = {
  id: string;
  path: string;
  rationale: string;
  upstreamClaimId?: string;
};

type Provenance = {
  schemaVersion: number;
  block: { name: string; version: string; digest: string };
  upstream: { repository: string; commit: string; sourcePath: string; note: string };
  digestVerification: {
    method: string;
    computedDigest: string;
    matchesDeclared: boolean;
  };
  configuration: { allowedTypes: string[]; sourceGlobs: string[] };
  renderedClaims: Array<ExclusivePathClaim | SemanticKeyClaim>;
  projectOwnedClaims: ExclusivePathClaim[];
  adaptations: Adaptation[];
};

const EXPECTED_BLOCK = {
  name: "ConventionalCommits",
  version: "1.0.0",
  digest: "sha256:f75a4a63e677b8bc6c10f90858aa18d75d84bed0e424949642dc13424ec402f1",
};
const EXPECTED_UPSTREAM = {
  repository: "clamor",
  commit: "a8f52a02de1fc1eb3ad408e94adabfb5a9b54621",
  sourcePath: "packages/blocks/conventional-commits/src/index.ts",
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
const REQUIRED_SOURCE_GLOBS = [
  "*.js",
  "*.jsx",
  "*.ts",
  "*.tsx",
  "*.mjs",
  "*.cjs",
  "*.mts",
  "*.cts",
];
const REQUIRED_RENDERED_CLAIMS = new Set([
  "githooks/commit-msg",
  "githooks/pre-commit",
  "commitlint-config",
  "install-git-hooks",
  "package/devDependencies/@commitlint/cli",
  "package/devDependencies/@commitlint/config-conventional",
  "package/scripts/prepare",
  "package/scripts/commitlint",
]);
const EXPECTED_EXCLUSIVE_PATHS = new Map([
  ["githooks/commit-msg", [".githooks/commit-msg", true] as const],
  ["githooks/pre-commit", [".githooks/pre-commit", true] as const],
  ["commitlint-config", ["commitlint.config.ts", false] as const],
  ["install-git-hooks", ["scripts/install-git-hooks.ts", false] as const],
]);
const EXPECTED_SEMANTIC_KEYS = new Map([
  [
    "package/devDependencies/@commitlint/cli",
    ["package.json", ["devDependencies", "@commitlint/cli"]] as const,
  ],
  [
    "package/devDependencies/@commitlint/config-conventional",
    ["package.json", ["devDependencies", "@commitlint/config-conventional"]] as const,
  ],
  ["package/scripts/prepare", ["package.json", ["scripts", "prepare"]] as const],
  ["package/scripts/commitlint", ["package.json", ["scripts", "commitlint"]] as const],
]);
const EXPECTED_ADAPTATIONS = new Map([
  ["commitlint-default-ignores-disabled", ["commitlint.config.ts", "commitlint-config"] as const],
  ["commitlint-squash-body-prose", ["commitlint.config.ts", "commitlint-config"] as const],
  ["pre-commit-fast-loop", [".githooks/pre-commit", "githooks/pre-commit"] as const],
  ["pre-push-integration", [".githooks/pre-push", undefined] as const],
]);
const REQUIRED_PROJECT_CLAIMS = new Set(["project/githooks/pre-push"]);

const digestOfText = (text: string): string =>
  `sha256:${createHash("sha256").update(text, "utf8").digest("hex")}`;
const sameJson = (left: unknown, right: unknown): boolean =>
  JSON.stringify(left) === JSON.stringify(right);

const problems: string[] = [];

if (!existsSync(provenancePath)) {
  console.error(`check-commit-policy: missing provenance record at ${provenancePath}`);
  process.exit(1);
}

let provenance: Provenance;
try {
  provenance = JSON.parse(readFileSync(provenancePath, "utf8")) as Provenance;
} catch (error) {
  console.error(
    `check-commit-policy: provenance is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
}

if (provenance.schemaVersion !== 1) {
  problems.push(`schemaVersion must be 1, found ${JSON.stringify(provenance.schemaVersion)}.`);
}
if (!sameJson(provenance.block, EXPECTED_BLOCK)) {
  problems.push(`block identity does not match the pinned ConventionalCommits definition.`);
}
if (
  provenance.upstream === undefined ||
  provenance.upstream.repository !== EXPECTED_UPSTREAM.repository ||
  provenance.upstream.commit !== EXPECTED_UPSTREAM.commit ||
  provenance.upstream.sourcePath !== EXPECTED_UPSTREAM.sourcePath ||
  typeof provenance.upstream.note !== "string" ||
  provenance.upstream.note.trim().length === 0
) {
  problems.push(`upstream repository, commit, source path, and note must match pinned provenance.`);
}
if (
  provenance.digestVerification === undefined ||
  provenance.digestVerification.computedDigest !== EXPECTED_BLOCK.digest ||
  provenance.digestVerification.matchesDeclared !== true ||
  typeof provenance.digestVerification.method !== "string" ||
  provenance.digestVerification.method.trim().length === 0
) {
  problems.push(
    `digest-verification fields are missing, malformed, or disagree with block identity.`,
  );
}
if (!sameJson(provenance.configuration?.allowedTypes, REQUIRED_ALLOWED_TYPES)) {
  problems.push(`configuration.allowedTypes does not match the required ordered policy.`);
}
if (!sameJson(provenance.configuration?.sourceGlobs, REQUIRED_SOURCE_GLOBS)) {
  problems.push(`configuration.sourceGlobs does not match the required ordered materialization.`);
}

const preCommitPath = resolve(root, ".githooks/pre-commit");
if (existsSync(preCommitPath)) {
  const materializedPattern = REQUIRED_SOURCE_GLOBS.join("|");
  if (!readFileSync(preCommitPath, "utf8").includes(materializedPattern)) {
    problems.push(
      `configuration.sourceGlobs is not materialized in .githooks/pre-commit as ${materializedPattern}.`,
    );
  }
}

const renderedClaims = Array.isArray(provenance.renderedClaims) ? provenance.renderedClaims : [];
const renderedClaimIds = new Set(renderedClaims.map((claim) => claim.claimId));
if (
  renderedClaimIds.size !== REQUIRED_RENDERED_CLAIMS.size ||
  [...REQUIRED_RENDERED_CLAIMS].some((claimId) => !renderedClaimIds.has(claimId))
) {
  problems.push(`renderedClaims does not contain the exact pinned upstream claim set.`);
}

const adaptations = Array.isArray(provenance.adaptations) ? provenance.adaptations : [];
const adaptationIds = new Set(adaptations.map((adaptation) => adaptation.id));
for (const adaptationId of EXPECTED_ADAPTATIONS.keys()) {
  if (!adaptationIds.has(adaptationId)) {
    problems.push(`local hardening adaptation "${adaptationId}" is not explicitly recorded.`);
  }
}
if (adaptationIds.size !== EXPECTED_ADAPTATIONS.size) {
  problems.push(`local hardening adaptations contain an unexpected or duplicate identity.`);
}
for (const adaptation of adaptations) {
  const expected = EXPECTED_ADAPTATIONS.get(adaptation.id);
  if (
    expected === undefined ||
    typeof adaptation.id !== "string" ||
    adaptation.path !== expected[0] ||
    adaptation.upstreamClaimId !== expected[1] ||
    typeof adaptation.rationale !== "string" ||
    adaptation.rationale.trim().length === 0
  ) {
    problems.push(`a local hardening adaptation is malformed.`);
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

const projectOwnedClaims = Array.isArray(provenance.projectOwnedClaims)
  ? provenance.projectOwnedClaims
  : [];
const projectClaimIds = new Set(projectOwnedClaims.map((claim) => claim.claimId));
if (
  projectClaimIds.size !== REQUIRED_PROJECT_CLAIMS.size ||
  [...REQUIRED_PROJECT_CLAIMS].some((claimId) => !projectClaimIds.has(claimId))
) {
  problems.push(`projectOwnedClaims does not contain the exact project-owned claim set.`);
}
const allClaims: Array<ExclusivePathClaim | SemanticKeyClaim> = [
  ...renderedClaims,
  ...projectOwnedClaims,
];
const seenClaimIds = new Set<string>();

for (const claim of allClaims) {
  if (seenClaimIds.has(claim.claimId)) {
    problems.push(`claim ID "${claim.claimId}" is duplicated.`);
    continue;
  }
  seenClaimIds.add(claim.claimId);
  if (REQUIRED_RENDERED_CLAIMS.has(claim.claimId)) {
    if (claim.kind === "exclusive_path") {
      const expected = EXPECTED_EXCLUSIVE_PATHS.get(claim.claimId);
      if (
        expected === undefined ||
        claim.path !== expected[0] ||
        claim.executable !== expected[1]
      ) {
        problems.push(`claim "${claim.claimId}" path or executable declaration is malformed.`);
      }
    } else {
      const expected = EXPECTED_SEMANTIC_KEYS.get(claim.claimId);
      if (
        expected === undefined ||
        claim.path !== expected[0] ||
        !sameJson(claim.key, expected[1])
      ) {
        problems.push(`claim "${claim.claimId}" semantic path or key is malformed.`);
      }
    }
  }
  const artifactPath = resolve(root, claim.path);
  if (artifactPath !== root && !artifactPath.startsWith(`${root}${sep}`)) {
    problems.push(`claim "${claim.claimId}" escapes the repository root.`);
    continue;
  }
  if (!existsSync(artifactPath)) {
    problems.push(`claim "${claim.claimId}" names ${claim.path}, which does not exist.`);
    continue;
  }

  if (claim.kind === "exclusive_path") {
    const actual = digestOfText(readFileSync(artifactPath, "utf8"));
    if (actual !== claim.contentDigest) {
      problems.push(
        `claim "${claim.claimId}" at ${claim.path} has drifted: recorded ${claim.contentDigest}, actual ${actual}.`,
      );
    }
    const executable = (statSync(artifactPath).mode & 0o111) !== 0;
    if (executable !== claim.executable) {
      problems.push(
        `claim "${claim.claimId}" executable mode drifted: recorded ${claim.executable}, actual ${executable}.`,
      );
    }
    continue;
  }

  const actualValue = readKeyPath(readPackageJson(), claim.key);
  if (!sameJson(actualValue, claim.value)) {
    problems.push(
      `claim "${claim.claimId}" expects ${claim.path}#${claim.key.join(".")} = ${JSON.stringify(claim.value)}, found ${JSON.stringify(actualValue)}.`,
    );
  }
}

if (problems.length > 0) {
  console.error("check-commit-policy: adapted commit policy does not conform to provenance.");
  for (const problem of problems) {
    console.error(`  - ${problem}`);
  }
  process.exit(1);
}

console.log(
  `check-commit-policy: ${provenance.block.name}@${provenance.block.version} (${provenance.block.digest}) — ${renderedClaims.length} upstream claims and ${projectOwnedClaims.length} project claims conform with ${adaptations.length} recorded adaptations.`,
);
