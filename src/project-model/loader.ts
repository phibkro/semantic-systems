import { Data, Effect, FileSystem, Path, Schema } from "effect";
import {
  ENTITY_KIND_VALUES,
  RELATION_KIND_VALUES,
  type Attributes,
  type Entity,
  type ProjectGraph,
  type Relation,
} from "./types.ts";

export class ProjectLoadError extends Data.TaggedError("ProjectLoadError")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}
export const MODEL_DOCUMENT_GLOB = "**/*.json";

const AttributesSchema = Schema.Record(Schema.String, Schema.Unknown);

export const EntityInputSchema = Schema.Struct({
  id: Schema.String,
  kind: Schema.Literals(ENTITY_KIND_VALUES),
  name: Schema.String,
  summary: Schema.optionalKey(Schema.String),
  status: Schema.optionalKey(Schema.NullOr(Schema.String)),
  tags: Schema.optionalKey(Schema.Array(Schema.String)),
  attributes: Schema.optionalKey(AttributesSchema),
}).annotate({
  identifier: "ProjectEntityInput",
  description: "One canonical project entity authored in a model document.",
});

export const RelationInputSchema = Schema.Struct({
  source: Schema.String,
  target: Schema.String,
  kind: Schema.Literals(RELATION_KIND_VALUES),
  summary: Schema.optionalKey(Schema.String),
  attributes: Schema.optionalKey(AttributesSchema),
}).annotate({
  identifier: "ProjectRelationInput",
  description: "One canonical project relation authored in a model document.",
});

export const ProjectDocumentInputSchema = Schema.Struct({
  entities: Schema.optionalKey(Schema.Array(EntityInputSchema)),
  relations: Schema.optionalKey(Schema.Array(RelationInputSchema)),
}).annotate({
  identifier: "ProjectDocumentInput",
  description: "A canonical Semantic Systems project-model source document.",
});

type EntityInput = typeof EntityInputSchema.Type;
type RelationInput = typeof RelationInputSchema.Type;

const asAttributes = (value: Readonly<Record<string, unknown>> | undefined): Attributes =>
  (value ?? {}) as Attributes;

const listModelFiles = (modelRoot: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    yield* fs.stat(modelRoot).pipe(
      Effect.mapError(
        (cause) =>
          new ProjectLoadError({
            message: `missing model directory: ${modelRoot}`,
            cause,
          }),
      ),
    );
    const sources = yield* fs.glob(MODEL_DOCUMENT_GLOB, { root: modelRoot }).pipe(
      Effect.mapError(
        (cause) =>
          new ProjectLoadError({
            message: `cannot list model documents: ${modelRoot}`,
            cause,
          }),
      ),
    );
    return sources.map((source) => path.join(modelRoot, source)).sort();
  });

const readDocument = (source: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const text = yield* fs
      .readFileString(source)
      .pipe(
        Effect.mapError(
          (cause) =>
            new ProjectLoadError({ message: `cannot read model document: ${source}`, cause }),
        ),
      );
    const input = yield* Schema.decodeUnknownEffect(Schema.UnknownFromJsonString)(text).pipe(
      Effect.mapError(
        (cause) =>
          new ProjectLoadError({
            message: `invalid JSON in model document: ${source}`,
            cause,
          }),
      ),
    );
    return yield* Schema.decodeUnknownEffect(ProjectDocumentInputSchema, {
      onExcessProperty: "error",
    })(input).pipe(
      Effect.mapError(
        (cause) =>
          new ProjectLoadError({
            message: `invalid model document ${source}: ${cause.message}`,
            cause,
          }),
      ),
    );
  });

const entityFrom = (input: EntityInput, source: string): Entity => ({
  id: input.id,
  kind: input.kind,
  name: input.name,
  summary: input.summary ?? "",
  status: input.status ?? null,
  tags: input.tags ?? [],
  attributes: asAttributes(input.attributes),
  source,
});

const relationFrom = (input: RelationInput, source: string): Relation => ({
  sourceId: input.source,
  targetId: input.target,
  kind: input.kind,
  summary: input.summary ?? "",
  attributes: asAttributes(input.attributes),
  source,
});

export const loadProject = (
  root: string,
): Effect.Effect<ProjectGraph, ProjectLoadError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const projectRoot = path.resolve(root);
    const sources = yield* listModelFiles(path.join(projectRoot, "model"));
    const entities = new Map<string, Entity>();
    const relations: Array<Relation> = [];

    for (const source of sources) {
      const document = yield* readDocument(source);
      for (const input of document.entities ?? []) {
        if (entities.has(input.id)) {
          return yield* new ProjectLoadError({ message: `duplicate entity ID: ${input.id}` });
        }
        entities.set(input.id, entityFrom(input, source));
      }
      for (const input of document.relations ?? []) relations.push(relationFrom(input, source));
    }
    return { entities, relations, root: projectRoot };
  });
