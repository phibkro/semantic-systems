import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { Effect } from "effect";
import { replaySurfaceDocumentEffects } from "../src/surface-execution/index.ts";
import { encodeCanonicalKernelEffectRunObservation } from "../src/kernel-interpreter/index.ts";

test("genuine Node replays readable affine effects through both backends", async () => {
  const source = await readFile(
    new URL("../examples/surface-language/unhandled-two-step.semantic", import.meta.url),
    "utf8",
  );
  const result = Effect.runSync(
    replaySurfaceDocumentEffects(source, {
      format: "semantic.kernel-observation-script",
      version: 1,
      observations: [
        { kind: "int", value: 42 },
        { kind: "bool", value: true },
      ],
    }),
  );

  assert.deepEqual(
    encodeCanonicalKernelEffectRunObservation(result.compiled),
    encodeCanonicalKernelEffectRunObservation(result.reference),
  );
  assert.deepEqual(result.reference.observation, {
    tag: "executed",
    provided_observations: 2,
    applied_observations: 2,
    requests: [
      {
        label: "fresh",
        operation: "allocate",
        argument: { kind: "unit" },
        result_type: { kind: "int" },
      },
      {
        label: "confirm",
        operation: "accept",
        argument: { kind: "int", value: 42 },
        result_type: { kind: "bool" },
      },
    ],
    result: { tag: "returned", value: { kind: "bool", value: true } },
  });
});
