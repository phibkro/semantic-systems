#!/usr/bin/env bun
/**
 * Validate one pull request's durable feature contract.
 *
 * The pull-request body selects exactly one checked-in feature ID (or the
 * explicit `trivial` class). The selected feature must have one frozen design
 * spec, one active or completed plan changed by this PR, and one executable
 * acceptance script. This is repository metadata validation, not semantic
 * validity: independent review and branch policy remain external gates.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const FEATURE_ID = /^[0-9]{4}-[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SHA = /^[0-9a-f]{40}$/;
const REQUIRED_SECTIONS = [
  "Design spec and semantic claim",
  "User-visible preview",
  "Semantic diff",
  "Checks run on this exact PR head",
  "Evidence categories and artifacts",
  "Assumptions and unsupported claims",
  "Independent reviewer / counterexamples considered",
  "Deviations and next uncertainty",
  "Cleanup",
] as const;

const TRIVIAL_EXACT_PATHS = new Set(["README.md", ".gitignore"]);
const TRIVIAL_PREFIXES = ["generated/"];

type PullRequestPayload = {
  pull_request?: {
    base?: { sha?: unknown };
    head?: { sha?: unknown };
    body?: unknown;
  };
};

export type FeatureSelection = {
  featureId: string | "trivial";
  base: string;
  head: string;
  changedPaths: string[];
  acceptanceScript?: string;
};

const parseArguments = (argv: string[]): Map<string, string> => {
  const parsed = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (key === undefined || value === undefined || !key.startsWith("--")) {
      throw new Error(`expected --name value arguments, received ${argv.join(" ")}`);
    }
    parsed.set(key, value);
  }
  return parsed;
};

const requireSha = (value: unknown, label: string): string => {
  if (typeof value !== "string" || !SHA.test(value)) {
    throw new Error(`${label} must be a 40-character lowercase Git SHA`);
  }
  return value;
};

const runGit = (root: string, args: string[]): string => {
  const result = spawnSync("git", args, {
    cwd: root,
    encoding: "utf8",
    shell: false,
  });
  if (result.error !== undefined || result.status !== 0) {
    throw new Error(
      `git ${args.join(" ")} failed: ${(result.stderr || result.error?.message || "").trim()}`,
    );
  }
  return result.stdout;
};

export const changedPathsForRange = (
  root: string,
  base: string,
  head: string,
  comparison: "pr" | "range" = "pr",
): string[] => {
  requireSha(base, "base SHA");
  requireSha(head, "head SHA");
  const range = comparison === "pr" ? `${base}...${head}` : `${base}..${head}`;
  const output = runGit(root, ["diff", "--name-only", "--diff-filter=ACMR", "-z", range]);
  return output.split("\0").filter((path) => path.length > 0);
};

const markerFromBody = (body: string): string | "trivial" => {
  const markers = [...body.matchAll(/^Feature-ID:\s*(.*?)\s*$/gm)].map((match) => match[1] ?? "");
  if (markers.length !== 1) {
    throw new Error(`PR body must contain exactly one Feature-ID marker; found ${markers.length}`);
  }
  const marker = markers[0];
  if (marker === "trivial") {
    return marker;
  }
  if (!FEATURE_ID.test(marker)) {
    throw new Error(`Feature-ID marker is malformed: ${JSON.stringify(marker)}`);
  }
  return marker;
};

const visibleSectionContent = (content: string): string =>
  content
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/^```[^\n]*$/gm, "")
    .trim();

const validateRequiredSections = (body: string): void => {
  const headings = [...body.matchAll(/^##\s+(.+?)\s*$/gm)];
  for (const required of REQUIRED_SECTIONS) {
    const matches = headings.filter((heading) => heading[1] === required);
    if (matches.length !== 1) {
      throw new Error(`PR report section "${required}" must appear exactly once`);
    }
    const heading = matches[0];
    const start = (heading.index ?? 0) + heading[0].length;
    const next = headings.find((candidate) => (candidate.index ?? 0) > start);
    const end = next?.index ?? body.length;
    if (visibleSectionContent(body.slice(start, end)).length === 0) {
      throw new Error(`PR report section "${required}" is empty or placeholder-only`);
    }
  }
};

const isExecutable = (path: string): boolean => (statSync(path).mode & 0o111) !== 0;

export const validateFeatureArtifacts = (
  root: string,
  featureId: string,
): { planPath: string; acceptanceScript: string } => {
  if (!FEATURE_ID.test(featureId)) {
    throw new Error(`feature ID is malformed: ${featureId}`);
  }
  const designPath = `design-specs/${featureId}.md`;
  if (!existsSync(resolve(root, designPath))) {
    throw new Error(`feature ${featureId} is missing ${designPath}`);
  }

  const planCandidates = [`plans/active/${featureId}.md`, `plans/completed/${featureId}.md`].filter(
    (path) => existsSync(resolve(root, path)),
  );
  if (planCandidates.length !== 1) {
    throw new Error(
      `feature ${featureId} must have exactly one active or completed plan; found ${planCandidates.length}`,
    );
  }

  const acceptanceScript = `scripts/accept/${featureId}.sh`;
  const acceptancePath = resolve(root, acceptanceScript);
  if (!existsSync(acceptancePath)) {
    throw new Error(`feature ${featureId} is missing ${acceptanceScript}`);
  }
  if (!isExecutable(acceptancePath)) {
    throw new Error(
      `feature ${featureId} acceptance script is not executable: ${acceptanceScript}`,
    );
  }
  return { planPath: planCandidates[0], acceptanceScript };
};

const isTrivialPath = (path: string): boolean =>
  TRIVIAL_EXACT_PATHS.has(path) || TRIVIAL_PREFIXES.some((prefix) => path.startsWith(prefix));

const featureIdsFromContractPaths = (paths: string[]): string[] => {
  const ids = new Set<string>();
  const patterns = [
    /^design-specs\/([0-9]{4}-[a-z0-9]+(?:-[a-z0-9]+)*)\.md$/,
    /^plans\/(?:active|completed)\/([0-9]{4}-[a-z0-9]+(?:-[a-z0-9]+)*)\.md$/,
    /^scripts\/accept\/([0-9]{4}-[a-z0-9]+(?:-[a-z0-9]+)*)\.sh$/,
  ];
  for (const path of paths) {
    for (const pattern of patterns) {
      const match = pattern.exec(path);
      if (match?.[1] !== undefined) {
        ids.add(match[1]);
      }
    }
  }
  return [...ids].sort();
};

export const validatePullRequestEvent = (root: string, eventPath: string): FeatureSelection => {
  const payload = JSON.parse(readFileSync(eventPath, "utf8")) as PullRequestPayload;
  const pullRequest = payload.pull_request;
  if (pullRequest === undefined) {
    throw new Error("event payload is missing pull_request");
  }
  const base = requireSha(pullRequest.base?.sha, "pull_request.base.sha");
  const head = requireSha(pullRequest.head?.sha, "pull_request.head.sha");
  if (typeof pullRequest.body !== "string") {
    throw new Error("pull_request.body must be a string");
  }
  const body = pullRequest.body;
  const featureId = markerFromBody(body);
  validateRequiredSections(body);
  const changedPaths = changedPathsForRange(root, base, head, "pr");

  if (featureId === "trivial") {
    const nontrivial = changedPaths.filter((path) => !isTrivialPath(path));
    if (nontrivial.length > 0) {
      throw new Error(
        `Feature-ID: trivial cannot cover nontrivial paths: ${nontrivial.join(", ")}`,
      );
    }
    return { featureId, base, head, changedPaths };
  }

  const artifacts = validateFeatureArtifacts(root, featureId);
  const changedFeatureIds = featureIdsFromContractPaths(changedPaths);
  const conflictingIds = changedFeatureIds.filter((changedId) => changedId !== featureId);
  if (conflictingIds.length > 0) {
    throw new Error(
      `PR contains multiple feature identities: selected ${featureId}, also changed ${conflictingIds.join(", ")}`,
    );
  }
  if (!changedPaths.includes(artifacts.planPath)) {
    throw new Error(
      `feature ${featureId} plan ${artifacts.planPath} did not change in PR range ${base}...${head}`,
    );
  }
  return {
    featureId,
    base,
    head,
    changedPaths,
    acceptanceScript: artifacts.acceptanceScript,
  };
};

if (import.meta.main) {
  try {
    const args = parseArguments(process.argv.slice(2));
    const root = resolve(args.get("--root") ?? resolve(import.meta.dirname, ".."));
    const eventPath = args.get("--event") ?? process.env.GITHUB_EVENT_PATH;
    if (eventPath === undefined) {
      throw new Error("provide --event <path> or GITHUB_EVENT_PATH");
    }
    const selection = validatePullRequestEvent(root, resolve(eventPath));
    console.log(
      `feature-contract: ${selection.featureId} at ${selection.head}; ${selection.changedPaths.length} changed path(s) validated.`,
    );
  } catch (error) {
    console.error(`feature-contract: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
