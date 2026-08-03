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
import { existsSync, lstatSync, readFileSync, realpathSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";

const root = resolve(import.meta.dirname, "..");
const provenancePath = resolve(root, "config/clamor-blocks/conventional-commits.provenance.json");
const canonicalRoot = realpathSync(root);

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
type ExpectedExclusivePathClaim = Readonly<{
  kind: "exclusive_path";
  path: string;
  executable: boolean;
  contentDigest: string;
}>;
type ExpectedSemanticKeyClaim = Readonly<{
  kind: "semantic_key";
  path: string;
  key: readonly string[];
  value: unknown;
}>;
type ExpectedClaim = ExpectedExclusivePathClaim | ExpectedSemanticKeyClaim;

const EXPECTED_RENDERED_CLAIMS: ReadonlyMap<string, ExpectedClaim> = new Map<string, ExpectedClaim>(
  [
    [
      "githooks/commit-msg",
      {
        kind: "exclusive_path",
        path: ".githooks/commit-msg",
        executable: true,
        contentDigest: "sha256:e5d969a4651e7145f7472d9d4c41262095649004ceb8b4fd800e1aa527e4dd2c",
      },
    ],
    [
      "githooks/pre-commit",
      {
        kind: "exclusive_path",
        path: ".githooks/pre-commit",
        executable: true,
        contentDigest: "sha256:7e1fbf459999cc4f47445c867e4c44069f9c1d17e9a8b37caf231a557de44f24",
      },
    ],
    [
      "commitlint-config",
      {
        kind: "exclusive_path",
        path: "commitlint.config.ts",
        executable: false,
        contentDigest: "sha256:319841d1099f113064933a9723a03eff5bb10a7d02d4a5cd7d6b1f4abfdacd28",
      },
    ],
    [
      "install-git-hooks",
      {
        kind: "exclusive_path",
        path: "scripts/install-git-hooks.ts",
        executable: false,
        contentDigest: "sha256:0cd600f4138e049f3b67131e612604a224030fd8a04aba0b2d8bb93909fab094",
      },
    ],
    [
      "package/devDependencies/@commitlint/cli",
      {
        kind: "semantic_key",
        path: "package.json",
        key: ["devDependencies", "@commitlint/cli"],
        value: "21.2.1",
      },
    ],
    [
      "package/devDependencies/@commitlint/config-conventional",
      {
        kind: "semantic_key",
        path: "package.json",
        key: ["devDependencies", "@commitlint/config-conventional"],
        value: "21.2.0",
      },
    ],
    [
      "package/scripts/prepare",
      {
        kind: "semantic_key",
        path: "package.json",
        key: ["scripts", "prepare"],
        value: "bun scripts/install-git-hooks.ts",
      },
    ],
    [
      "package/scripts/commitlint",
      {
        kind: "semantic_key",
        path: "package.json",
        key: ["scripts", "commitlint"],
        value: "commitlint",
      },
    ],
    [
      "package/scripts/check-commit-policy",
      {
        kind: "semantic_key",
        path: "package.json",
        key: ["scripts", "check-commit-policy"],
        value: "bun scripts/check-commit-policy.ts",
      },
    ],
  ],
);
const EXPECTED_PROJECT_CLAIMS: ReadonlyMap<string, ExpectedClaim> = new Map<string, ExpectedClaim>([
  [
    "project/githooks/pre-push",
    {
      kind: "exclusive_path",
      path: ".githooks/pre-push",
      executable: true,
      contentDigest: "sha256:360e81283a596d99d8c1866afed76fcf6224f6396ca6b40c7ea45f559eba8ef8",
    },
  ],
]);
const REQUIRED_RENDERED_CLAIMS = new Set(EXPECTED_RENDERED_CLAIMS.keys());
const REQUIRED_PROJECT_CLAIMS = new Set(EXPECTED_PROJECT_CLAIMS.keys());
const EXPECTED_ADAPTATIONS = new Map([
  ["commit-msg-bun-runtime", [".githooks/commit-msg", "githooks/commit-msg"] as const],
  ["commitlint-default-ignores-disabled", ["commitlint.config.ts", "commitlint-config"] as const],
  ["commitlint-squash-body-prose", ["commitlint.config.ts", "commitlint-config"] as const],
  ["pre-commit-bun-fast-loop", [".githooks/pre-commit", "githooks/pre-commit"] as const],
  ["pre-push-bun-integration", [".githooks/pre-push", undefined] as const],
  ["install-git-hooks-fail-closed", ["scripts/install-git-hooks.ts", "install-git-hooks"] as const],
]);

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

const packageJsonByPath = new Map<string, Record<string, unknown>>();
const readPackageJson = (
  artifactPath: string,
  claimId: string,
): Record<string, unknown> | undefined => {
  const cached = packageJsonByPath.get(artifactPath);
  if (cached !== undefined) {
    return cached;
  }
  try {
    const parsed = JSON.parse(readFileSync(artifactPath, "utf8")) as unknown;
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      problems.push(`claim "${claimId}" names ${artifactPath}, which is not a JSON object.`);
      return undefined;
    }
    const record = parsed as Record<string, unknown>;
    packageJsonByPath.set(artifactPath, record);
    return record;
  } catch (error) {
    problems.push(
      `claim "${claimId}" could not parse ${artifactPath}: ${error instanceof Error ? error.message : String(error)}.`,
    );
    return undefined;
  }
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

const resolveClaimPath = (claimId: string, claimPath: unknown): string | undefined => {
  if (typeof claimPath !== "string") {
    problems.push(`claim "${claimId}" path is malformed.`);
    return undefined;
  }
  const lexicalPath = resolve(root, claimPath);
  if (lexicalPath !== root && !lexicalPath.startsWith(`${root}${sep}`)) {
    problems.push(`claim "${claimId}" escapes the repository root.`);
    return undefined;
  }

  const relativePath = relative(root, lexicalPath);
  const components = relativePath === "" ? [] : relativePath.split(sep);
  let currentPath = root;
  for (const component of components) {
    currentPath = join(currentPath, component);
    let entry;
    try {
      entry = lstatSync(currentPath);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      problems.push(`claim "${claimId}" names ${claimPath}, which does not exist: ${detail}.`);
      return undefined;
    }
    if (entry.isSymbolicLink()) {
      problems.push(
        `claim "${claimId}" uses a symlinked path component at ${relative(root, currentPath)}.`,
      );
      return undefined;
    }
  }

  let canonicalPath: string;
  try {
    canonicalPath = realpathSync(lexicalPath);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    problems.push(`claim "${claimId}" could not be canonically resolved: ${detail}.`);
    return undefined;
  }
  if (canonicalPath !== canonicalRoot && !canonicalPath.startsWith(`${canonicalRoot}${sep}`)) {
    problems.push(`claim "${claimId}" resolves outside the repository root.`);
    return undefined;
  }
  return canonicalPath;
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
}

const validateClaim = (
  claim: ExclusivePathClaim | SemanticKeyClaim,
  expectedClaims: ReadonlyMap<string, ExpectedClaim>,
  category: "rendered" | "project-owned",
): void => {
  const expected = expectedClaims.get(claim.claimId);
  if (expected === undefined) {
    problems.push(`${category} claim "${claim.claimId}" is not an allowed pinned claim.`);
    return;
  }
  if (claim.kind !== expected.kind) {
    problems.push(
      `${category} claim "${claim.claimId}" does not match its immutable expected declaration.`,
    );
    return;
  }
  if (
    claim.kind === "exclusive_path" &&
    expected.kind === "exclusive_path" &&
    (claim.path !== expected.path ||
      claim.executable !== expected.executable ||
      claim.contentDigest !== expected.contentDigest)
  ) {
    problems.push(
      `${category} claim "${claim.claimId}" does not match its immutable expected declaration.`,
    );
  }
  if (
    claim.kind === "semantic_key" &&
    expected.kind === "semantic_key" &&
    (claim.path !== expected.path ||
      !sameJson(claim.key, expected.key) ||
      !sameJson(claim.value, expected.value))
  ) {
    problems.push(
      `${category} claim "${claim.claimId}" does not match its immutable expected declaration.`,
    );
  }

  const artifactPath = resolveClaimPath(claim.claimId, claim.path);
  if (artifactPath === undefined) {
    return;
  }

  if (claim.kind === "exclusive_path") {
    let actual: string;
    try {
      actual = digestOfText(readFileSync(artifactPath, "utf8"));
    } catch (error) {
      problems.push(
        `claim "${claim.claimId}" at ${claim.path} could not be read: ${error instanceof Error ? error.message : String(error)}.`,
      );
      return;
    }
    if (actual !== claim.contentDigest) {
      problems.push(
        `claim "${claim.claimId}" at ${claim.path} has drifted: recorded ${claim.contentDigest}, actual ${actual}.`,
      );
    }
    let executable: boolean;
    try {
      executable = (statSync(artifactPath).mode & 0o111) !== 0;
    } catch (error) {
      problems.push(
        `claim "${claim.claimId}" at ${claim.path} could not be inspected: ${error instanceof Error ? error.message : String(error)}.`,
      );
      return;
    }
    if (executable !== claim.executable) {
      problems.push(
        `claim "${claim.claimId}" executable mode drifted: recorded ${claim.executable}, actual ${executable}.`,
      );
    }
    return;
  }

  if (!Array.isArray(claim.key) || !claim.key.every((segment) => typeof segment === "string")) {
    problems.push(`claim "${claim.claimId}" semantic key is malformed.`);
    return;
  }
  const packageJson = readPackageJson(artifactPath, claim.claimId);
  if (packageJson === undefined) {
    return;
  }
  const actualValue = readKeyPath(packageJson, claim.key);
  if (!sameJson(actualValue, claim.value)) {
    problems.push(
      `claim "${claim.claimId}" expects ${claim.path}#${claim.key.join(".")} = ${JSON.stringify(claim.value)}, found ${JSON.stringify(actualValue)}.`,
    );
  }
};

for (const claim of renderedClaims) {
  validateClaim(claim, EXPECTED_RENDERED_CLAIMS, "rendered");
}
for (const claim of projectOwnedClaims) {
  validateClaim(claim, EXPECTED_PROJECT_CLAIMS, "project-owned");
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
