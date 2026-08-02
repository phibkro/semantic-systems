import { Data, Effect, FileSystem, Path } from "effect";
import { assessWork, criticalPath } from "./schedule.ts";
import { renderFeatureLifecycle } from "./work-lifecycle.ts";
import {
  PROJECT_DOCUMENT_SCHEMA_PATH,
  projectDocumentJsonSchemaText,
} from "./project-json-schema.ts";
import { byKind, incoming, type Entity, type ProjectGraph, type Relation } from "./types.ts";

export class ViewWriteError extends Data.TaggedError("ViewWriteError")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

const compareText = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;
const identifier = (value: string): string => value.replace(/[^A-Za-z0-9]/g, "_");
const node = (entity: Entity): string => `${identifier(entity.id)}["${entity.name}"]`;
const edge = (relation: Relation): string =>
  `${identifier(relation.sourceId)} -->|${relation.kind.replaceAll("_", " ")}| ${identifier(relation.targetId)}`;
const document = (title: string, body: string): string =>
  `# ${title}\n\n<!-- Generated. Edit model sources, not this file. -->\n\n${body.trimEnd()}\n`;

const mermaid = (
  project: ProjectGraph,
  relations: ReadonlyArray<Relation>,
  direction: string,
): string => {
  const ids = new Set(relations.flatMap((relation) => [relation.sourceId, relation.targetId]));
  const lines = ["```mermaid", `flowchart ${direction}`];
  lines.push(
    ...[...ids].sort(compareText).map((entityId) => `    ${node(project.entities.get(entityId)!)}`),
  );
  lines.push(...relations.map((relation) => `    ${edge(relation)}`), "```");
  return lines.join("\n");
};

const systemMap = (project: ProjectGraph): string => {
  const relations = project.relations.filter((relation) => relation.kind === "contains");
  return document(
    "System map",
    `Recursive component and package containment.\n\n${mermaid(project, relations, "TD")}`,
  );
};

const theoryRealization = (project: ProjectGraph): string => {
  const kinds = new Set([
    "theory",
    "realization",
    "handler",
    "domain_machine",
    "effect",
    "invariant",
  ]);
  const relationKinds = new Set(["realizes", "requires", "extends", "refines", "preserves"]);
  const relations = project.relations.filter(
    (relation) =>
      relationKinds.has(relation.kind) &&
      (kinds.has(project.entities.get(relation.sourceId)!.kind) ||
        kinds.has(project.entities.get(relation.targetId)!.kind)),
  );
  return document(
    "Theory-realization map",
    `Semantic contracts and executable interpretations.\n\n${mermaid(project, relations, "LR")}`,
  );
};

const concernMatrix = (project: ProjectGraph): string => {
  const components = [...project.entities.values()].filter((entity) =>
    new Set(["component", "runtime", "handler"]).has(entity.kind),
  );
  const assignments = new Map<string, Set<string>>();
  const concerns = new Set<string>();
  for (const entity of components) {
    const raw = entity.attributes.responsibilities;
    const values = new Set<string>(
      Array.isArray(raw) ? raw.filter((item): item is string => typeof item === "string") : [],
    );
    assignments.set(entity.id, values);
    for (const value of values) concerns.add(value);
  }
  const ordered = [...concerns].sort(compareText);
  const rows = [
    `| Component | ${ordered.join(" | ")} |`,
    `|---|${ordered.map(() => "---:").join("|")}|`,
  ];
  for (const entity of components.sort((left, right) => compareText(left.name, right.name))) {
    const cells = ordered.map((concern) => (assignments.get(entity.id)!.has(concern) ? "●" : ""));
    rows.push(`| ${entity.name} | ${cells.join(" | ")} |`);
  }
  return document(
    "Concern matrix",
    `Dense rows suggest overloaded components; dense columns reveal cross-cutting concerns.\n\n${rows.join("\n")}`,
  );
};

const evidenceMap = (project: ProjectGraph): string => {
  const kinds = new Set(["supports", "discharges", "assumes", "validates", "covers"]);
  const relations = project.relations.filter((relation) => kinds.has(relation.kind));
  const unsupported = byKind(project, "claim").filter(
    (claim) => incoming(project, claim.id, new Set(["supports", "discharges"])).length === 0,
  );
  const suffix =
    unsupported.length === 0
      ? ""
      : `\n\n## Unsupported claims\n\n${unsupported.map((claim) => `- \`${claim.id}\` — ${claim.name}`).join("\n")}`;
  return document("Evidence and trust map", `${mermaid(project, relations, "TD")}${suffix}`);
};

const workDependencies = (project: ProjectGraph): string => {
  const allowedIds = new Set(
    [...project.entities.values()]
      .filter((entity) => new Set(["work_item", "decision"]).has(entity.kind))
      .map((entity) => entity.id),
  );
  const kinds = new Set(["blocks", "requires", "informs"]);
  const relations = project.relations.filter(
    (relation) =>
      allowedIds.has(relation.sourceId) &&
      allowedIds.has(relation.targetId) &&
      kinds.has(relation.kind),
  );
  const names = criticalPath(project)
    .map((entityId) => project.entities.get(entityId)!.name)
    .join(" → ");
  return document(
    "Work dependencies",
    `${mermaid(project, relations, "LR")}\n\n## Weighted critical path\n\n${names || "No acyclic path available."}`,
  );
};

const delegationFrontier = (project: ProjectGraph): string => {
  const assessments = assessWork(project);
  const rows = [
    "| Work item | Phase | Status | Ready | Score | Recommendation | Blockers |",
    "|---|---|---|---:|---:|---|---|",
  ];
  for (const assessment of assessments) {
    const { entity } = assessment;
    const blockers = assessment.blockers
      .map((item) => project.entities.get(item)?.name ?? item)
      .join(", ");
    rows.push(
      `| ${entity.name} | ${entity.attributes.phase ?? ""} | ${entity.status ?? ""} | ${
        assessment.ready ? "yes" : "no"
      } | ${assessment.agentability} | ${assessment.recommendation} | ${blockers} |`,
    );
  }
  const ready = assessments.filter((assessment) => assessment.ready).length;
  return document(
    "Delegation frontier",
    `Ready parallel work items: **${ready}**.\n\n${rows.join("\n")}`,
  );
};

const runtimeView = (project: ProjectGraph): string => {
  const kinds = new Set(["hosts", "handles", "reads", "writes", "publishes", "sends"]);
  const relations = project.relations.filter((relation) => kinds.has(relation.kind));
  return document(
    "Runtime interaction view",
    `Actor ownership, STM access, commit publication, and message delivery.\n\n${mermaid(project, relations, "LR")}`,
  );
};

const index = (project: ProjectGraph): string => {
  const counts = new Map<string, number>();
  for (const entity of project.entities.values()) {
    counts.set(entity.kind, (counts.get(entity.kind) ?? 0) + 1);
  }
  const rows = ["| Kind | Count |", "|---|---:|"];
  rows.push(
    ...[...counts]
      .sort(([left], [right]) => compareText(left, right))
      .map(([kind, count]) => `| ${kind} | ${count} |`),
  );
  return document(
    "Generated project views",
    `${rows.join("\n")}\n\n- [System map](01-system-map.md)\n- [Theory-realization map](02-theory-realization.md)\n- [Concern matrix](03-concern-matrix.md)\n- [Evidence map](04-evidence-map.md)\n- [Work dependencies](05-work-dependencies.md)\n- [Delegation frontier](06-delegation-frontier.md)\n- [Runtime view](07-runtime-view.md)\n- [Feature lifecycle](08-feature-lifecycle.md)\n- [Project document JSON Schema](schema/project-document.schema.json)`,
  );
};

export const generateViews = (project: ProjectGraph): ReadonlyMap<string, string> =>
  new Map([
    ["README.md", index(project)],
    ["01-system-map.md", systemMap(project)],
    ["02-theory-realization.md", theoryRealization(project)],
    ["03-concern-matrix.md", concernMatrix(project)],
    ["04-evidence-map.md", evidenceMap(project)],
    ["05-work-dependencies.md", workDependencies(project)],
    ["06-delegation-frontier.md", delegationFrontier(project)],
    ["07-runtime-view.md", runtimeView(project)],
    ["08-feature-lifecycle.md", renderFeatureLifecycle(project)],
    [PROJECT_DOCUMENT_SCHEMA_PATH.replace("generated/", ""), projectDocumentJsonSchemaText()],
  ]);

export const writeGeneratedFiles = (
  output: string,
  views: ReadonlyMap<string, string>,
  check: boolean,
): Effect.Effect<ReadonlyArray<string>, ViewWriteError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    if (!check) {
      yield* fs.makeDirectory(output, { recursive: true }).pipe(
        Effect.mapError(
          (cause) =>
            new ViewWriteError({
              message: `cannot create generated directory: ${output}`,
              cause,
            }),
        ),
      );
    }
    const changed: Array<string> = [];
    for (const [name, content] of [...views].sort(([left], [right]) => compareText(left, right))) {
      const destination = path.join(output, name);
      if (!check) {
        yield* fs.makeDirectory(path.dirname(destination), { recursive: true }).pipe(
          Effect.mapError(
            (cause) =>
              new ViewWriteError({
                message: `cannot create generated view directory: ${destination}`,
                cause,
              }),
          ),
        );
      }
      const exists = yield* fs.exists(destination).pipe(
        Effect.mapError(
          (cause) =>
            new ViewWriteError({
              message: `cannot inspect generated view: ${destination}`,
              cause,
            }),
        ),
      );
      const current = exists
        ? yield* fs.readFileString(destination).pipe(
            Effect.mapError(
              (cause) =>
                new ViewWriteError({
                  message: `cannot read generated view: ${destination}`,
                  cause,
                }),
            ),
          )
        : undefined;
      if (current !== content) {
        changed.push(destination);
        if (!check) {
          yield* fs.writeFileString(destination, content).pipe(
            Effect.mapError(
              (cause) =>
                new ViewWriteError({
                  message: `cannot write generated view: ${destination}`,
                  cause,
                }),
            ),
          );
        }
      }
    }
    return changed;
  });
