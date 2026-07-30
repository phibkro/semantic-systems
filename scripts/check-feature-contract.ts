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
export const DESIGN_LENS_VERSION = "open-semantic-system-v1";
export const DESIGN_LENS_HEADINGS = [
  "Boundary and warranted state",
  "Semantic inputs",
  "Semantic outputs",
  "Effect protocols and uncertainty",
  "Components and orthogonal structures",
  "Bounded autonomy and resources",
  "Evidence, assumptions, and unsupported claims",
] as const;
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
  contractMigrations?: string[];
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
  // Observe both sides of detected renames and copies. `--name-only` reports
  // only the destination, which would let a nontrivial source disappear into
  // the `generated/` trivial allowlist. Explicit detection settings keep this
  // authority inventory independent of each checkout's Git configuration.
  const output = runGit(root, [
    "-c",
    "diff.renames=true",
    "-c",
    "diff.renameLimit=32767",
    "-c",
    "diff.algorithm=histogram",
    "diff",
    "--name-status",
    "-z",
    "--find-renames=50%",
    "--find-copies=50%",
    "--find-copies-harder",
    range,
    "--",
  ]);
  const fields = output.split("\0");
  if (fields.at(-1) === "") {
    fields.pop();
  }
  const paths = new Set<string>();
  for (let index = 0; index < fields.length;) {
    const status = fields[index++];
    if (status === undefined || status.length === 0) {
      throw new Error(`git diff returned an empty name-status record for ${range}`);
    }
    const pathCount = status.startsWith("R") || status.startsWith("C") ? 2 : 1;
    for (let offset = 0; offset < pathCount; offset += 1) {
      const path = fields[index++];
      if (path === undefined || path.length === 0) {
        throw new Error(`git diff returned a truncated ${status} record for ${range}`);
      }
      paths.add(path);
    }
  }
  return [...paths];
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

const designStructuralText = (content: string): string => {
  // This is deliberately a bounded structural scanner, not a Markdown renderer:
  // only fenced blocks and HTML comments can hide contract markers. Follow the
  // CommonMark fence constraints that matter here so prose samples cannot
  // accidentally create or consume a design-lens boundary.
  const visible: Array<string> = [];
  let fence:
    | {
        readonly marker: "`" | "~";
        readonly length: number;
      }
    | undefined;
  let inHtmlComment = false;

  for (const rawLine of content.split("\n")) {
    const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;

    if (fence !== undefined) {
      const closing = new RegExp(`^ {0,3}\\${fence.marker}{${fence.length},}[\\t ]*$`);
      if (closing.test(line)) {
        fence = undefined;
      }
      visible.push("");
      continue;
    }

    if (!inHtmlComment) {
      const opening = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
      if (opening !== null) {
        const run = opening[1]!;
        const rest = opening[2]!;
        if (run[0] === "~" || !rest.includes("`")) {
          fence = {
            marker: run[0] as "`" | "~",
            length: run.length,
          };
          visible.push("");
          continue;
        }
      }
    }

    let remainder = line;
    let structural = "";
    while (remainder.length > 0) {
      if (inHtmlComment) {
        const end = remainder.indexOf("-->");
        if (end === -1) {
          remainder = "";
          break;
        }
        inHtmlComment = false;
        remainder = remainder.slice(end + 3);
        continue;
      }

      const start = remainder.indexOf("<!--");
      if (start === -1) {
        structural += remainder;
        remainder = "";
        break;
      }
      structural += remainder.slice(0, start);
      inHtmlComment = true;
      remainder = remainder.slice(start + 4);
    }
    visible.push(structural);
  }

  return visible.join("\n");
};

const PLACEHOLDER_WORDS = new Set([
  "todo",
  "tbd",
  "placeholder",
  "later",
  "pending",
  "coming",
  "soon",
  "fill",
  "me",
  "explain",
  "none",
  "na",
  "n/a",
]);

const visibleDesignContent = (content: string): string => designStructuralText(content).trim();

const isPlaceholderOnly = (content: string): boolean => {
  const visible = visibleDesignContent(content);
  if (visible.length === 0) return true;
  const words = visible
    .toLowerCase()
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^[\s>*+-]+/gm, "")
    .split(/[\s`_*[\](){}:;,.!?-]+/)
    .filter((word) => word.length > 0);
  return words.every((word) => PLACEHOLDER_WORDS.has(word) || /^[0-9]+$/.test(word));
};

type StructuralHeading = {
  readonly level: number;
  readonly title: string;
  readonly line: number;
};

const structuralHeadings = (lines: readonly string[]): StructuralHeading[] =>
  lines.flatMap((line, index) => {
    const match = /^ {0,3}(#{1,6})(?:[ \t]+(.*)|[ \t]*)$/.exec(line);
    if (match === null) return [];
    const rawTitle = match[2] ?? "";
    const title = rawTitle.replace(/[ \t]+#+[ \t]*$/, "").trim();
    return [{ level: match[1]!.length, title, line: index }];
  });

export const validateDesignLensText = (content: string, path: string): void => {
  const structure = designStructuralText(content);
  const lines = structure.split("\n");
  const markers = lines.flatMap((line) => {
    const match = /^Design-Lens-Version:[ \t]*(.*?)[ \t]*$/.exec(line);
    return match === null ? [] : [match[1] ?? ""];
  });
  if (markers.length !== 1) {
    throw new Error(
      `${path} design-lens shape requires exactly one Design-Lens-Version marker; found ${markers.length}`,
    );
  }
  if (markers[0] !== DESIGN_LENS_VERSION) {
    throw new Error(
      `${path} design-lens version must be ${DESIGN_LENS_VERSION}; received ${JSON.stringify(markers[0])}`,
    );
  }

  const headings = structuralHeadings(lines);
  const levelTwo = headings.filter((heading) => heading.level === 2);
  const lensHeadings = levelTwo.filter(
    (heading) => heading.title === "Open semantic system design lens",
  );
  if (lensHeadings.length !== 1) {
    throw new Error(
      `${path} design-lens shape requires exactly one "Open semantic system design lens" section; found ${lensHeadings.length}`,
    );
  }
  const lensHeading = lensHeadings[0]!;
  const start = lensHeading.line + 1;
  const nextSectionBoundary = headings.find(
    (candidate) => candidate.line > lensHeading.line && candidate.level <= 2,
  );
  const end = nextSectionBoundary?.line ?? lines.length;
  const levelThree = headings.filter(
    (heading) => heading.level === 3 && heading.line >= start && heading.line < end,
  );

  for (const required of DESIGN_LENS_HEADINGS) {
    const matches = levelThree.filter((heading) => heading.title === required);
    if (matches.length !== 1) {
      throw new Error(
        `${path} design-lens subsection "${required}" must appear exactly once; found ${matches.length}`,
      );
    }
    const heading = matches[0]!;
    const sectionStart = heading.line + 1;
    const next = levelThree.find((candidate) => candidate.line > heading.line);
    const sectionEnd = next?.line ?? end;
    if (isPlaceholderOnly(lines.slice(sectionStart, sectionEnd).join("\n"))) {
      throw new Error(`${path} design-lens subsection "${required}" is empty or placeholder-only`);
    }
  }
};

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

  const acceptanceScript = `scripts/accept/${featureId}.ts`;
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

export const nonTrivialPaths = (paths: string[]): string[] =>
  paths.filter((path) => !isTrivialPath(path));

export const featureIdsFromContractPaths = (paths: string[]): string[] => {
  const ids = new Set<string>();
  const patterns = [
    /^design-specs\/([0-9]{4}-[a-z0-9]+(?:-[a-z0-9]+)*)\.md$/,
    /^plans\/(?:active|completed)\/([0-9]{4}-[a-z0-9]+(?:-[a-z0-9]+)*)\.md$/,
    /^scripts\/accept\/([0-9]{4}-[a-z0-9]+(?:-[a-z0-9]+)*)\.ts$/,
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

export const contractMigrationsFor = (root: string, featureId: string): string[] => {
  const designPath = resolve(root, "design-specs", `${featureId}.md`);
  if (!existsSync(designPath)) return [];
  const contents = readFileSync(designPath, "utf8");
  const markers = [...contents.matchAll(/^Migrates-Feature-IDs:\s*(.*?)\s*$/gm)];
  if (markers.length === 0) return [];
  if (markers.length !== 1) {
    throw new Error(`feature ${featureId} design must contain at most one migration marker`);
  }
  const migrations = (markers[0]?.[1] ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  if (
    migrations.length === 0 ||
    migrations.some((value) => !FEATURE_ID.test(value) || value === featureId) ||
    new Set(migrations).size !== migrations.length
  ) {
    throw new Error(`feature ${featureId} has a malformed Migrates-Feature-IDs marker`);
  }
  return migrations.sort();
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
    const nontrivial = nonTrivialPaths(changedPaths);
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
  const contractMigrations = contractMigrationsFor(root, featureId);
  const designPath = `design-specs/${featureId}.md`;
  if (contractMigrations.length > 0 && !changedPaths.includes(designPath)) {
    throw new Error(
      `feature ${featureId} cannot reuse contract migrations without changing ${designPath}`,
    );
  }
  const undeclaredIds = conflictingIds.filter(
    (changedId) => !contractMigrations.includes(changedId),
  );
  const unchangedDeclarations = contractMigrations.filter(
    (migration) => !conflictingIds.includes(migration),
  );
  if (undeclaredIds.length > 0) {
    throw new Error(
      `PR contains multiple feature identities: selected ${featureId}, undeclared changes ${undeclaredIds.join(", ")}`,
    );
  }
  if (unchangedDeclarations.length > 0) {
    throw new Error(
      `feature ${featureId} declares unchanged contract migrations: ${unchangedDeclarations.join(", ")}`,
    );
  }
  for (const changedFeatureId of [featureId, ...contractMigrations]) {
    const changedDesignPath = `design-specs/${changedFeatureId}.md`;
    if (!changedPaths.includes(changedDesignPath)) continue;
    const absoluteDesignPath = resolve(root, changedDesignPath);
    if (!existsSync(absoluteDesignPath)) {
      throw new Error(`changed design contract is missing at ${changedDesignPath}`);
    }
    validateDesignLensText(readFileSync(absoluteDesignPath, "utf8"), changedDesignPath);
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
    contractMigrations,
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
    const migrations =
      selection.contractMigrations === undefined || selection.contractMigrations.length === 0
        ? ""
        : `; contract migrations: ${selection.contractMigrations.join(", ")}`;
    console.log(
      `feature-contract: ${selection.featureId} at ${selection.head}; ${selection.changedPaths.length} changed path(s) validated${migrations}.`,
    );
  } catch (error) {
    console.error(`feature-contract: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
