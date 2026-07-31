import { Data, Effect, FileSystem, Path, Schema } from "effect";
import {
  ArtifactSchema,
  decodePortfolioDocument,
  LabelSchema,
  MembershipSchema,
  PrioritySchema,
  ProjectSchema,
  ReceiptSchema,
  RelationSchema,
  SavedViewSchema,
  SnapshotSchema,
  StudioSchema,
  WorkSchema,
  type PortfolioDecodeFailure,
  type PortfolioDocument,
} from "./decode.ts";

const ROW_VERSION = "pbk.portfolio-row/v1" as const;

export const PortfolioRowSchema = Schema.Union([
  Schema.Struct({
    schema_version: Schema.Literal(ROW_VERSION),
    record_type: Schema.Literal("studio"),
    value: StudioSchema,
  }),
  Schema.Struct({
    schema_version: Schema.Literal(ROW_VERSION),
    record_type: Schema.Literal("project"),
    value: ProjectSchema,
  }),
  Schema.Struct({
    schema_version: Schema.Literal(ROW_VERSION),
    record_type: Schema.Literal("work"),
    value: WorkSchema,
  }),
  Schema.Struct({
    schema_version: Schema.Literal(ROW_VERSION),
    record_type: Schema.Literal("relation"),
    value: RelationSchema,
  }),
  Schema.Struct({
    schema_version: Schema.Literal(ROW_VERSION),
    record_type: Schema.Literal("label"),
    value: LabelSchema,
  }),
  Schema.Struct({
    schema_version: Schema.Literal(ROW_VERSION),
    record_type: Schema.Literal("membership"),
    value: MembershipSchema,
  }),
  Schema.Struct({
    schema_version: Schema.Literal(ROW_VERSION),
    record_type: Schema.Literal("view"),
    value: SavedViewSchema,
  }),
  Schema.Struct({
    schema_version: Schema.Literal(ROW_VERSION),
    record_type: Schema.Literal("artifact"),
    value: ArtifactSchema,
  }),
  Schema.Struct({
    schema_version: Schema.Literal(ROW_VERSION),
    record_type: Schema.Literal("priority"),
    value: PrioritySchema,
  }),
  Schema.Struct({
    schema_version: Schema.Literal(ROW_VERSION),
    record_type: Schema.Literal("receipt"),
    value: ReceiptSchema,
  }),
  Schema.Struct({
    schema_version: Schema.Literal(ROW_VERSION),
    record_type: Schema.Literal("snapshot"),
    value: SnapshotSchema,
  }),
]);
export type PortfolioRow = typeof PortfolioRowSchema.Type;
const PortfolioSourceSchema = Schema.Union([
  PortfolioRowSchema,
  Schema.Struct({
    schema_version: Schema.Literal("pbk.portfolio-row-set/v1"),
    rows: Schema.Array(PortfolioRowSchema).pipe(Schema.check(Schema.isMaxLength(2048))),
  }),
]);

export class PortfolioLoadFailure extends Data.TaggedError("PortfolioLoadFailure")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

const decodeSource = (input: unknown) =>
  Schema.decodeUnknownEffect(PortfolioSourceSchema, { onExcessProperty: "error" })(input).pipe(
    Effect.map(
      (source): ReadonlyArray<PortfolioRow> => ("rows" in source ? source.rows : [source]),
    ),
    Effect.mapError((cause) => new PortfolioLoadFailure({ message: cause.message, cause })),
  );

const orderById = <A extends { readonly id: string }>(rows: ReadonlyArray<A>): ReadonlyArray<A> =>
  [...rows].sort((left, right) => left.id.localeCompare(right.id));

export const assemblePortfolioRows = (
  inputs: ReadonlyArray<unknown>,
): Effect.Effect<PortfolioDocument, PortfolioLoadFailure | PortfolioDecodeFailure> =>
  Effect.gen(function* () {
    const rows = (yield* Effect.forEach(inputs, decodeSource)).flat();
    const studios = rows.filter((row) => row.record_type === "studio");
    if (studios.length !== 1) {
      return yield* new PortfolioLoadFailure({
        message: "portfolio requires exactly one studio row",
      });
    }
    return yield* decodePortfolioDocument({
      schema_version: "pbk.portfolio/v1",
      studio: studios[0]!.value,
      projects: orderById(
        rows.flatMap((row) => (row.record_type === "project" ? [row.value] : [])),
      ),
      work: orderById(rows.flatMap((row) => (row.record_type === "work" ? [row.value] : []))),
      relations: orderById(
        rows.flatMap((row) => (row.record_type === "relation" ? [row.value] : [])),
      ),
      labels: orderById(rows.flatMap((row) => (row.record_type === "label" ? [row.value] : []))),
      memberships: orderById(
        rows.flatMap((row) => (row.record_type === "membership" ? [row.value] : [])),
      ),
      views: orderById(rows.flatMap((row) => (row.record_type === "view" ? [row.value] : []))),
      artifacts: orderById(
        rows.flatMap((row) => (row.record_type === "artifact" ? [row.value] : [])),
      ),
      priorities: orderById(
        rows.flatMap((row) => (row.record_type === "priority" ? [row.value] : [])),
      ),
      receipts: orderById(
        rows.flatMap((row) => (row.record_type === "receipt" ? [row.value] : [])),
      ),
      snapshots: orderById(
        rows.flatMap((row) => (row.record_type === "snapshot" ? [row.value] : [])),
      ),
    });
  });

export const loadPortfolio = (
  root: string,
): Effect.Effect<
  PortfolioDocument,
  PortfolioLoadFailure | PortfolioDecodeFailure,
  FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const portfolioRoot = path.join(path.resolve(root), "portfolio");
    const names = yield* fs
      .glob("**/*.json", { root: portfolioRoot })
      .pipe(
        Effect.mapError(
          (cause) => new PortfolioLoadFailure({ message: `cannot list ${portfolioRoot}`, cause }),
        ),
      );
    const inputs = yield* Effect.forEach([...names].sort(), (name) =>
      fs.readFileString(path.join(portfolioRoot, name)).pipe(
        Effect.mapError(
          (cause) =>
            new PortfolioLoadFailure({ message: `cannot read portfolio row ${name}`, cause }),
        ),
        Effect.flatMap((text) =>
          Schema.decodeUnknownEffect(Schema.UnknownFromJsonString)(text).pipe(
            Effect.mapError(
              (cause) => new PortfolioLoadFailure({ message: `invalid JSON in ${name}`, cause }),
            ),
          ),
        ),
      ),
    );
    return yield* assemblePortfolioRows(inputs);
  });
