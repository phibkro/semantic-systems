#!/usr/bin/env bun
/**
 * Validate one pull request's durable feature contract.
 *
 * PR body selects exactly one checked-in feature ID (or the explicit `trivial`
 * class). Canonical feature records resolve stable design, plan, and acceptance
 * artifacts. This is repository metadata validation, not semantic validity:
 * independent review and branch policy remain external gates.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import {
  generate as generateCss,
  ident as cssIdentifier,
  lexer as cssLexer,
  parse as parseCss,
  walk as walkCss,
  type Declaration,
  type DeclarationList,
} from "css-tree";
import { fromMarkdown } from "mdast-util-from-markdown";
import type { Heading, Nodes, RootContent } from "mdast";
import { micromark } from "micromark";
import { parseFragment, type DefaultTreeAdapterTypes } from "parse5";
import { BunFileSystem, BunPath } from "@effect/platform-bun";
import { Console, Data, Effect } from "effect";
import { loadProject } from "../src/project-model/loader.ts";
import {
  FEATURE_ID_PATTERN,
  featuresForChangedPaths,
  isFeatureDiagnostic,
  resolveFeature,
  validateFeatureRepository,
  type FeatureArtifacts,
} from "../src/project-model/work-lifecycle.ts";
import { runMain } from "./lib/command.ts";

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
  feature?: FeatureArtifacts;
  contractMigrations?: string[];
};

export class FeatureContractError extends Data.TaggedError("FeatureContractError")<{
  readonly message: string;
}> {}

const attempt = <A>(thunk: () => A): Effect.Effect<A, FeatureContractError> =>
  Effect.try({
    try: thunk,
    catch: (cause) =>
      new FeatureContractError({
        message: cause instanceof Error ? cause.message : String(cause),
      }),
  });

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
): Effect.Effect<string[], FeatureContractError> =>
  attempt(() => {
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
  });

const markerFromBody = (body: string): string | "trivial" => {
  const markers = [...body.matchAll(/^Feature-ID:\s*(.*?)\s*$/gm)].map((match) => match[1] ?? "");
  if (markers.length !== 1) {
    throw new Error(`PR body must contain exactly one Feature-ID marker; found ${markers.length}`);
  }
  const marker = markers[0];
  if (marker === "trivial") {
    return marker;
  }
  if (!FEATURE_ID_PATTERN.test(marker)) {
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
  "audio",
  "canvas",
  "datalist",
  "head",
  "iframe",
  "math",
  "meter",
  "noembed",
  "noframes",
  "noscript",
  "object",
  "optgroup",
  "option",
  "progress",
  "rp",
  "script",
  "select",
  "style",
  "svg",
  "template",
  "title",
  "video",
]);

const directStyleExcludesContent = (style: string): boolean => {
  let declarationList: DeclarationList;
  try {
    const parsed = parseCss(style, { context: "declarationList", positions: false });
    if (parsed.type !== "DeclarationList") return false;
    declarationList = parsed;
  } catch {
    // An unparseable direct style is outside this static evidence boundary.
    // Excluding its subtree prevents unknown rendering from satisfying prose.
    return true;
  }

  const cascaded = new Map<string, { important: boolean; value: string }>();
  for (const child of declarationList.children) {
    if (child.type !== "Declaration") continue;
    const declaration = child as Declaration;
    const property = cssIdentifier.decode(declaration.property).toLowerCase();
    if (property !== "display" && property !== "visibility") continue;
    const value = cssIdentifier.decode(generateCss(declaration.value).trim()).toLowerCase();
    const grammar = cssLexer.matchProperty(property, value);
    if (grammar.error !== null) {
      let indeterminate = false;
      walkCss(declaration.value, (node) => {
        if (node.type === "Function" || node.type === "Raw") indeterminate = true;
      });
      // Substitution and opaque syntax depends on state this gate does not
      // observe. It is neither fabricated as visible nor parsed by a local
      // approximation of the browser's evolving argument grammars.
      if (indeterminate) return true;
      continue;
    }
    const important = Boolean(declaration.important);
    const previous = cascaded.get(property);
    if (previous?.important === true && !important) continue;
    cascaded.set(property, {
      important,
      value,
    });
  }

  return (
    cascaded.get("display")?.value === "none" ||
    new Set(["hidden", "collapse"]).has(cascaded.get("visibility")?.value ?? "")
  );
};

const staticallyHidden = (node: DefaultTreeAdapterTypes.Element): boolean => {
  if (NONVISIBLE_HTML_ELEMENTS.has(node.tagName)) return true;
  if (node.attrs.some((attribute) => attribute.name === "hidden")) return true;
  if (
    node.attrs.some((attribute) => attribute.name === "popover") &&
    !(node.tagName === "dialog" && node.attrs.some((attribute) => attribute.name === "open"))
  ) {
    return true;
  }
  if (node.tagName === "dialog" && !node.attrs.some((attribute) => attribute.name === "open")) {
    return true;
  }
  const style = node.attrs.find((attribute) => attribute.name === "style")?.value;
  return style !== undefined && directStyleExcludesContent(style);
};

const renderedMarkdownContent = (source: string): string => {
  const textFrom = (node: DefaultTreeAdapterTypes.Node): string => {
    if ("value" in node) return node.value;
    if (node.nodeName === "#comment" || node.nodeName === "#documentType") return "";
    if ("tagName" in node && staticallyHidden(node)) return "";
    if (
      "tagName" in node &&
      node.tagName === "details" &&
      !node.attrs.some((attribute) => attribute.name === "open")
    ) {
      const summary = node.childNodes.find(
        (child): child is DefaultTreeAdapterTypes.Element =>
          "tagName" in child && child.tagName === "summary",
      );
      return summary === undefined ? "" : textFrom(summary);
    }
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

const isTrivialPath = (path: string): boolean =>
  TRIVIAL_EXACT_PATHS.has(path) || TRIVIAL_PREFIXES.some((prefix) => path.startsWith(prefix));

export const nonTrivialPaths = (paths: string[]): string[] =>
  paths.filter((path) => !isTrivialPath(path));

export const contractMigrationsFor = (root: string, feature: FeatureArtifacts): string[] => {
  const designPath = resolve(root, feature.designSpecPath);
  if (!existsSync(designPath)) return [];
  const contents = readFileSync(designPath, "utf8");
  const markers = [...contents.matchAll(/^Migrates-Feature-IDs:\s*(.*?)\s*$/gm)];
  if (markers.length === 0) return [];
  if (markers.length !== 1) {
    throw new Error(
      `feature ${feature.featureId} design must contain at most one migration marker`,
    );
  }
  const migrations = (markers[0]?.[1] ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  if (
    migrations.length === 0 ||
    migrations.some((value) => !FEATURE_ID_PATTERN.test(value) || value === feature.featureId) ||
    new Set(migrations).size !== migrations.length
  ) {
    throw new Error(`feature ${feature.featureId} has a malformed Migrates-Feature-IDs marker`);
  }
  return migrations.sort();
};

export type MigrationOwnership = {
  readonly migrationsByOwner: ReadonlyMap<string, ReadonlyArray<string>>;
  readonly migratedFeatureIds: ReadonlySet<string>;
};

export const migrationOwnershipForRange = (
  root: string,
  features: ReadonlyArray<FeatureArtifacts>,
  changedPaths: ReadonlyArray<string>,
): MigrationOwnership => {
  const changedFeatureIds = new Set(features.map((feature) => feature.featureId));
  const migrationsByOwner = new Map<string, ReadonlyArray<string>>();
  const ownerByMigratedFeature = new Map<string, string>();

  for (const feature of features) {
    if (!changedPaths.includes(feature.designSpecPath)) continue;
    const migrations = contractMigrationsFor(root, feature);
    if (migrations.length === 0) continue;
    for (const migrated of migrations) {
      if (!changedFeatureIds.has(migrated)) {
        throw new Error(
          `feature ${feature.featureId} declares unchanged contract migration ${migrated} in range`,
        );
      }
      const existingOwner = ownerByMigratedFeature.get(migrated);
      if (existingOwner !== undefined) {
        throw new Error(
          `contract migration ${migrated} has ambiguous range ownership: ${existingOwner}, ${feature.featureId}`,
        );
      }
      ownerByMigratedFeature.set(migrated, feature.featureId);
    }
    migrationsByOwner.set(feature.featureId, migrations);
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (featureId: string, path: ReadonlyArray<string>): void => {
    if (visiting.has(featureId)) {
      throw new Error(`cyclic contract migration ownership: ${[...path, featureId].join(" -> ")}`);
    }
    if (visited.has(featureId)) return;
    visiting.add(featureId);
    for (const migrated of migrationsByOwner.get(featureId) ?? []) {
      if (migrationsByOwner.has(migrated)) visit(migrated, [...path, featureId]);
    }
    visiting.delete(featureId);
    visited.add(featureId);
  };
  for (const owner of migrationsByOwner.keys()) visit(owner, []);

  return {
    migrationsByOwner,
    migratedFeatureIds: new Set(ownerByMigratedFeature.keys()),
  };
};

const featureDiagnosticMessage = (diagnostic: {
  readonly code: string;
  readonly message: string;
}): string => `${diagnostic.code}: ${diagnostic.message}`;

const requireFeature = (
  project: Parameters<typeof resolveFeature>[0],
  featureId: string,
): Effect.Effect<FeatureArtifacts, FeatureContractError> => {
  const result = resolveFeature(project, featureId);
  return isFeatureDiagnostic(result)
    ? Effect.fail(new FeatureContractError({ message: featureDiagnosticMessage(result) }))
    : Effect.succeed(result);
};

const requireValidFeatureRepository = (
  project: Parameters<typeof resolveFeature>[0],
  root: string,
) =>
  validateFeatureRepository(project, root).pipe(
    Effect.flatMap((diagnostics) =>
      diagnostics.length === 0
        ? Effect.void
        : Effect.fail(
            new FeatureContractError({
              message: diagnostics.map(featureDiagnosticMessage).join("; "),
            }),
          ),
    ),
  );

export const validatePullRequestEvent = (root: string, eventPath: string) =>
  Effect.gen(function* () {
    const parsed = yield* attempt(() => {
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
      return { base, head, body, featureId };
    });
    const { base, head, featureId } = parsed;
    const changedPaths = yield* changedPathsForRange(root, base, head, "pr");

    if (featureId === "trivial") {
      const nontrivial = nonTrivialPaths(changedPaths);
      if (nontrivial.length > 0) {
        return yield* new FeatureContractError({
          message: `Feature-ID: trivial cannot cover nontrivial paths: ${nontrivial.join(", ")}`,
        });
      }
      return {
        featureId,
        base,
        head,
        changedPaths,
      } satisfies FeatureSelection;
    }

    const project = yield* loadProject(root);
    yield* requireValidFeatureRepository(project, root);
    const feature = yield* requireFeature(project, featureId);
    const changedFeatureIds = featuresForChangedPaths(project, changedPaths);
    if (!changedFeatureIds.includes(featureId)) {
      return yield* new FeatureContractError({
        message: `feature ${featureId} did not change in PR range ${base}...${head}`,
      });
    }
    const changedFeatures = yield* Effect.forEach(changedFeatureIds, (changedId) =>
      requireFeature(project, changedId),
    );
    const ownership = yield* attempt(() =>
      migrationOwnershipForRange(root, changedFeatures, changedPaths),
    );
    const contractMigrations = ownership.migrationsByOwner.get(featureId) ?? [];
    const conflictingIds = changedFeatureIds.filter(
      (changedId) => changedId !== featureId && !contractMigrations.includes(changedId),
    );
    if (conflictingIds.length > 0) {
      return yield* new FeatureContractError({
        message: `PR contains multiple feature identities: selected ${featureId}, undeclared changes ${conflictingIds.join(", ")}`,
      });
    }
    for (const changedFeature of changedFeatures) {
      if (
        !changedPaths.includes(changedFeature.designSpecPath) ||
        changedFeature.acceptance.kind === "superseded"
      ) {
        continue;
      }
      yield* attempt(() => {
        const absoluteDesignPath = resolve(root, changedFeature.designSpecPath);
        if (!existsSync(absoluteDesignPath)) {
          throw new Error(`changed design contract is missing at ${changedFeature.designSpecPath}`);
        }
        validateDesignLensText(
          readFileSync(absoluteDesignPath, "utf8"),
          changedFeature.designSpecPath,
        );
      });
    }
    return {
      featureId,
      base,
      head,
      changedPaths,
      feature,
      contractMigrations: [...contractMigrations],
    } satisfies FeatureSelection;
  });

if (import.meta.main) {
  const program = Effect.gen(function* () {
    const args = yield* attempt(() => parseArguments(process.argv.slice(2)));
    const root = resolve(args.get("--root") ?? resolve(import.meta.dirname, ".."));
    const eventPath = args.get("--event") ?? process.env.GITHUB_EVENT_PATH;
    if (eventPath === undefined) {
      return yield* new FeatureContractError({
        message: "provide --event <path> or GITHUB_EVENT_PATH",
      });
    }
    const selection = yield* validatePullRequestEvent(root, resolve(eventPath));
    const migrations =
      selection.contractMigrations === undefined || selection.contractMigrations.length === 0
        ? ""
        : `; contract migrations: ${selection.contractMigrations.join(", ")}`;
    yield* Console.log(
      `feature-contract: ${selection.featureId} at ${selection.head}; ${selection.changedPaths.length} changed path(s) validated${migrations}.`,
    );
  }).pipe(Effect.provide([BunFileSystem.layer, BunPath.layer]));
  runMain("feature-contract", program);
}
