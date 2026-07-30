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
import { fromMarkdown } from "mdast-util-from-markdown";
import type { Heading, Nodes, RootContent } from "mdast";
import { micromark } from "micromark";
import { parseFragment, type DefaultTreeAdapterTypes } from "parse5";

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

const isPlaceholderOnly = (visible: string): boolean => {
  const normalized = visible.trim();
  if (normalized.length === 0) return true;
  const words = normalized
    .toLowerCase()
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^[\s>*+-]+/gm, "")
    .split(/[\s`_*[\](){}:;,.!?-]+/)
    .filter((word) => word.length > 0);
  return words.every((word) => PLACEHOLDER_WORDS.has(word) || /^[0-9]+$/.test(word));
};

const sourceForNode = (content: string, node: Nodes): string => {
  const start = node.position?.start.offset;
  const end = node.position?.end.offset;
  return start === undefined || end === undefined ? "" : content.slice(start, end);
};

const atxHeadingTitle = (content: string, heading: Heading): string | undefined => {
  const source = sourceForNode(content, heading);
  const match = /^ {0,3}(#{1,6})(?:[ \t]+(.*)|[ \t]*)$/.exec(source);
  if (match === null || match[1]!.length !== heading.depth) return undefined;
  return (match[2] ?? "").replace(/[ \t]+#+[ \t]*$/, "").trim();
};

const NONVISIBLE_HTML_ELEMENTS = new Set([
  "canvas",
  "datalist",
  "head",
  "iframe",
  "noembed",
  "noframes",
  "noscript",
  "object",
  "script",
  "style",
  "template",
  "title",
]);

const staticallyHidden = (node: DefaultTreeAdapterTypes.Element): boolean => {
  if (NONVISIBLE_HTML_ELEMENTS.has(node.tagName)) return true;
  if (node.attrs.some((attribute) => attribute.name === "hidden")) return true;
  if (node.tagName === "dialog" && !node.attrs.some((attribute) => attribute.name === "open")) {
    return true;
  }
  const style = node.attrs
    .find((attribute) => attribute.name === "style")
    ?.value.toLowerCase()
    .replaceAll(/\s+/g, "");
  return (
    style !== undefined &&
    /(?:^|;)(?:display:none|visibility:(?:hidden|collapse))(?:!important)?(?:;|$)/.test(style)
  );
};

const renderedMarkdownContent = (source: string): string => {
  const textFrom = (node: DefaultTreeAdapterTypes.Node): string => {
    if ("value" in node) return node.value;
    if (node.nodeName === "#comment" || node.nodeName === "#documentType") return "";
    if ("tagName" in node && staticallyHidden(node)) return "";
    if ("childNodes" in node) return node.childNodes.map((child) => textFrom(child)).join("\n");
    return "";
  };

  return textFrom(parseFragment(micromark(source, { allowDangerousHtml: true })));
};

const codeRanges = (node: Nodes): ReadonlyArray<readonly [start: number, end: number]> => {
  if (node.type === "code") {
    const start = node.position?.start.offset;
    const end = node.position?.end.offset;
    return start === undefined || end === undefined ? [] : [[start, end]];
  }
  if ("children" in node) {
    return node.children.flatMap((child) => codeRanges(child));
  }
  return [];
};

const visibleDesignContent = (content: string, nodes: readonly RootContent[]): string => {
  const first = nodes[0]?.position?.start.offset;
  const end = nodes.at(-1)?.position?.end.offset;
  if (first === undefined || end === undefined) return "";

  const ranges = nodes.flatMap((node) => codeRanges(node)).sort(([left], [right]) => left - right);
  let cursor = first;
  let source = "";
  for (const [hiddenStart, hiddenEnd] of ranges) {
    source += content.slice(cursor, hiddenStart);
    source += content.slice(hiddenStart, hiddenEnd).replace(/[^\r\n]/g, " ");
    cursor = hiddenEnd;
  }
  source += content.slice(cursor, end);
  return renderedMarkdownContent(source);
};

const markerValues = (content: string, children: readonly RootContent[]): string[] =>
  children.flatMap((node) => {
    if (node.type !== "paragraph") return [];
    const match = /^Design-Lens-Version:[ \t]*(.*?)[ \t]*$/.exec(sourceForNode(content, node));
    return match === null ? [] : [match[1] ?? ""];
  });

type StructuralHeading = {
  readonly level: number;
  readonly title: string;
  readonly childIndex: number;
};

const structuralHeadings = (
  content: string,
  children: readonly RootContent[],
): StructuralHeading[] =>
  children.flatMap((node, childIndex) => {
    if (node.type !== "heading") return [];
    const title = atxHeadingTitle(content, node);
    return title === undefined ? [] : [{ level: node.depth, title, childIndex }];
  });

export const validateDesignLensText = (content: string, path: string): void => {
  const document = fromMarkdown(content);
  const children = document.children;
  const markers = markerValues(content, children);
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

  const headings = structuralHeadings(content, children);
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
  const start = lensHeading.childIndex + 1;
  const nextSectionBoundary = headings.find(
    (candidate) => candidate.childIndex > lensHeading.childIndex && candidate.level <= 2,
  );
  const end = nextSectionBoundary?.childIndex ?? children.length;
  const levelThree = headings.filter(
    (heading) => heading.level === 3 && heading.childIndex >= start && heading.childIndex < end,
  );

  for (const required of DESIGN_LENS_HEADINGS) {
    const matches = levelThree.filter((heading) => heading.title === required);
    if (matches.length !== 1) {
      throw new Error(
        `${path} design-lens subsection "${required}" must appear exactly once; found ${matches.length}`,
      );
    }
    const heading = matches[0]!;
    const sectionStart = heading.childIndex + 1;
    const next = levelThree.find((candidate) => candidate.childIndex > heading.childIndex);
    const sectionEnd = next?.childIndex ?? end;
    const visible = visibleDesignContent(content, children.slice(sectionStart, sectionEnd));
    if (isPlaceholderOnly(visible)) {
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
