/** Version 1 backend bounds and strict differential result schema. */
import { Schema } from "effect";
import { narrowBoundedInteger, readBoundField } from "../kernel-execution/prepare.ts";

export interface KernelBytecodeBounds {
  readonly maximumInstructions: number;
  readonly maximumBlocks: number;
  readonly maximumConstants: number;
  readonly maximumOperandStackDepth: number;
  readonly maximumContinuationDepth: number;
  readonly vmFuel: number;
  readonly maximumTraceEntries: number;
}

export const defaultKernelBytecodeBounds: KernelBytecodeBounds = Object.freeze({
  maximumInstructions: 16_384,
  maximumBlocks: 4_096,
  maximumConstants: 16_384,
  maximumOperandStackDepth: 4_096,
  maximumContinuationDepth: 4_096,
  vmFuel: 10_000,
  maximumTraceEntries: 10_000,
});

export const narrowKernelBytecodeBounds = (input: unknown): KernelBytecodeBounds =>
  Object.freeze({
    maximumInstructions: narrowBoundedInteger(
      readBoundField(input, "maximumInstructions"),
      defaultKernelBytecodeBounds.maximumInstructions,
      1,
    ),
    maximumBlocks: narrowBoundedInteger(
      readBoundField(input, "maximumBlocks"),
      defaultKernelBytecodeBounds.maximumBlocks,
      1,
    ),
    maximumConstants: narrowBoundedInteger(
      readBoundField(input, "maximumConstants"),
      defaultKernelBytecodeBounds.maximumConstants,
      0,
    ),
    maximumOperandStackDepth: narrowBoundedInteger(
      readBoundField(input, "maximumOperandStackDepth"),
      defaultKernelBytecodeBounds.maximumOperandStackDepth,
      0,
    ),
    maximumContinuationDepth: narrowBoundedInteger(
      readBoundField(input, "maximumContinuationDepth"),
      defaultKernelBytecodeBounds.maximumContinuationDepth,
      0,
    ),
    vmFuel: narrowBoundedInteger(
      readBoundField(input, "vmFuel"),
      defaultKernelBytecodeBounds.vmFuel,
      0,
    ),
    maximumTraceEntries: narrowBoundedInteger(
      readBoundField(input, "maximumTraceEntries"),
      defaultKernelBytecodeBounds.maximumTraceEntries,
      1,
    ),
  });

const HexSchema = Schema.String.pipe(Schema.check(Schema.isPattern(/^(?:[0-9a-f]{2})*$/)));

export const DifferentialComparisonSchema = Schema.Union([
  Schema.Struct({
    tag: Schema.Literal("agreement"),
    canonical_bytes_hex: HexSchema,
  }),
  Schema.Struct({
    tag: Schema.Literal("mismatch"),
    reference_bytes_hex: HexSchema,
    compiled_bytes_hex: HexSchema,
  }),
  Schema.Struct({
    tag: Schema.Literal("inconclusive"),
    reference_reason: Schema.NullOr(Schema.Literals(["fuel", "trace"])),
    compiled_reason: Schema.NullOr(Schema.Literals(["fuel", "trace"])),
  }),
]);

export type DifferentialComparison = typeof DifferentialComparisonSchema.Type;
