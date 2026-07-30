import { Effect, FileSystem, Path, Schema } from "effect";
import { DocumentError, type JsonObject } from "./json.ts";

const JsonObjectSchema = Schema.Record(Schema.String, Schema.Unknown);
const StringRecordSchema = Schema.Record(Schema.String, Schema.String);
const DeclarationSchema = Schema.Struct({
  id: Schema.String,
});
const DeclarationListSchema = Schema.Array(DeclarationSchema);
const TheorySchema = Schema.Struct({
  id: Schema.String,
  normalization: Schema.String,
  types: DeclarationListSchema,
  operations: DeclarationListSchema,
  effects: DeclarationListSchema,
  laws: DeclarationListSchema,
  invariants: DeclarationListSchema,
  observations: DeclarationListSchema,
  obligations: DeclarationListSchema,
});
const RealizationSchema = Schema.Struct({
  id: Schema.String,
  theory: Schema.String,
  representation: StringRecordSchema,
  operations: StringRecordSchema,
  handled_effects: StringRecordSchema,
  platform_requirements: Schema.Array(Schema.String),
  assumptions: Schema.Array(Schema.String),
});
const ProducerSchema = Schema.Struct({
  id: Schema.String,
  version: Schema.String,
});
const ConformanceCaseSchema = Schema.Struct({
  id: Schema.String,
  initial_state: JsonObjectSchema,
  steps: Schema.Array(JsonObjectSchema),
  expected_events: Schema.Array(JsonObjectSchema),
  expected_final_state: JsonObjectSchema,
});
const EvidenceSuiteSchema = Schema.Struct({
  kind: Schema.Literal("conformance_suite"),
  schema_version: Schema.Literal(1),
  id: Schema.String,
  theory: Schema.String,
  theory_identity: Schema.String,
  obligation: Schema.String,
  category: Schema.String,
  producer: ProducerSchema,
  assumptions: Schema.Array(Schema.String),
  cases: Schema.Array(ConformanceCaseSchema),
});
const PolicyRuleSchema = Schema.Struct({
  accepted_categories: Schema.Array(Schema.String),
  allow_assumptions: Schema.Boolean,
});
const PolicySchema = Schema.Struct({
  id: Schema.String,
  requirements: Schema.Record(Schema.String, PolicyRuleSchema),
  ambiguity: Schema.String,
});
const ScenarioSchema = Schema.Struct({
  id: Schema.String,
  initial_state: JsonObjectSchema,
  steps: Schema.Array(JsonObjectSchema),
  expected_events: Schema.Array(JsonObjectSchema),
  expected_final_state: JsonObjectSchema,
});

type DocumentSchema = Schema.Decoder<unknown, never>;

export interface InventoryFixture {
  readonly theory: JsonObject;
  readonly realizations: ReadonlyArray<JsonObject>;
  readonly evidenceSuites: ReadonlyArray<JsonObject>;
  readonly policy: JsonObject;
  readonly scenario: JsonObject;
}

const readJson = (
  path: string,
  schema: DocumentSchema,
  context: string,
): Effect.Effect<JsonObject, DocumentError, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const text = yield* fs
      .readFileString(path)
      .pipe(
        Effect.mapError((cause) => new DocumentError({ message: `cannot read ${path}`, cause })),
      );
    const input = yield* Schema.decodeUnknownEffect(Schema.UnknownFromJsonString)(text).pipe(
      Effect.mapError((cause) => new DocumentError({ message: `invalid JSON in ${path}`, cause })),
    );
    return yield* Schema.decodeUnknownEffect(schema)(input).pipe(
      Effect.map(() => input as JsonObject),
      Effect.mapError(
        (cause) =>
          new DocumentError({
            message: `invalid ${context} document ${path}: ${cause.message}`,
            cause,
          }),
      ),
    );
  });

const jsonFiles = (
  directory: string,
): Effect.Effect<ReadonlyArray<string>, DocumentError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const exists = yield* fs
      .exists(directory)
      .pipe(
        Effect.mapError(
          (cause) => new DocumentError({ message: `cannot inspect ${directory}`, cause }),
        ),
      );
    if (!exists) return [];
    const sources = yield* fs
      .glob("*.json", { root: directory })
      .pipe(
        Effect.mapError(
          (cause) => new DocumentError({ message: `cannot list ${directory}`, cause }),
        ),
      );
    return sources.map((source) => path.join(directory, source)).sort();
  });

const readJsonFiles = (
  directory: string,
  schema: DocumentSchema,
  context: string,
): Effect.Effect<ReadonlyArray<JsonObject>, DocumentError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const paths = yield* jsonFiles(directory);
    const documents: Array<JsonObject> = [];
    for (const path of paths) documents.push(yield* readJson(path, schema, context));
    return documents;
  });

const requireUniqueIds = (documents: ReadonlyArray<JsonObject>, context: string): void => {
  const ids = documents.map((document) => document.id);
  if (ids.some((id) => typeof id !== "string")) {
    throw new DocumentError({ message: `${context}.id must be a string` });
  }
  if (new Set(ids).size !== ids.length) {
    throw new DocumentError({ message: `${context} contains duplicate IDs` });
  }
};

export const loadInventory = (
  root: string,
  policyName: string,
): Effect.Effect<InventoryFixture, DocumentError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const inventoryRoot = path.resolve(root);
    const theories = yield* readJsonFiles(
      path.join(inventoryRoot, "contracts"),
      TheorySchema,
      "theory",
    );
    if (theories.length !== 1) {
      return yield* new DocumentError({
        message: `expected exactly one theory contract under ${path.join(inventoryRoot, "contracts")}`,
      });
    }
    const realizations = yield* readJsonFiles(
      path.join(inventoryRoot, "realizations"),
      RealizationSchema,
      "realization",
    );
    if (realizations.length === 0) {
      return yield* new DocumentError({
        message: `no realizations found under ${path.join(inventoryRoot, "realizations")}`,
      });
    }
    yield* Effect.try({
      try: () => requireUniqueIds(realizations, "realizations"),
      catch: (error) =>
        error instanceof DocumentError
          ? error
          : new DocumentError({ message: "invalid realization IDs", cause: error }),
    });
    const evidenceSuites = yield* readJsonFiles(
      path.join(inventoryRoot, "evidence"),
      EvidenceSuiteSchema,
      "evidence suite",
    );
    const policyPath = path.join(inventoryRoot, "policies", `${policyName}.json`);
    const policyExists = yield* fs
      .exists(policyPath)
      .pipe(
        Effect.mapError(
          (cause) => new DocumentError({ message: `cannot inspect ${policyPath}`, cause }),
        ),
      );
    if (!policyExists) {
      return yield* new DocumentError({
        message: `unknown policy '${policyName}': missing ${policyPath}`,
      });
    }
    const policy = yield* readJson(policyPath, PolicySchema, "policy");
    const scenarios = yield* readJsonFiles(
      path.join(inventoryRoot, "scenarios"),
      ScenarioSchema,
      "scenario",
    );
    if (scenarios.length !== 1) {
      return yield* new DocumentError({
        message: `expected exactly one scenario under ${path.join(inventoryRoot, "scenarios")}`,
      });
    }
    return {
      theory: theories[0]!,
      realizations,
      evidenceSuites,
      policy,
      scenario: scenarios[0]!,
    };
  });
