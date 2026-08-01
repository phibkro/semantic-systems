import assert from "node:assert/strict";
import test from "node:test";
import { runCompiledKernelJsonBytesWithObservationScript } from "../src/kernel-bytecode/index.ts";
import {
  encodeCanonicalKernelEffectRunObservation,
  interpretKernelJsonBytesWithObservationScript,
} from "../src/kernel-interpreter/index.ts";

const source = new TextEncoder().encode(
  JSON.stringify({
    format: "semantic.kernel-json",
    version: 1,
    kernel: "semantic.kernel-calculus/0018/v1",
    signature: [
      {
        label: "fresh",
        operation: "allocate",
        argument_type: { tag: "unit" },
        result_type: { tag: "int" },
      },
    ],
    program: {
      tag: "let",
      bound: {
        tag: "operation",
        grade: "1",
        label: "fresh",
        operation: "allocate",
        argument: { tag: "unit" },
      },
      body: {
        tag: "return",
        grade: "1",
        value: { tag: "bound-value", distance: 0 },
      },
    },
  }),
);

const script = {
  format: "semantic.kernel-observation-script",
  version: 1,
  observations: [{ kind: "int", value: 42 }],
};

test("genuine Node drives identical reference and compiled one-shot effects", () => {
  const reference = interpretKernelJsonBytesWithObservationScript(source, script);
  const compiled = runCompiledKernelJsonBytesWithObservationScript(source, script);
  assert.deepEqual(
    encodeCanonicalKernelEffectRunObservation(compiled),
    encodeCanonicalKernelEffectRunObservation(reference),
  );
  assert.deepEqual(reference.observation, {
    tag: "executed",
    provided_observations: 1,
    applied_observations: 1,
    requests: [
      {
        label: "fresh",
        operation: "allocate",
        argument: { kind: "unit" },
        result_type: { kind: "int" },
      },
    ],
    result: { tag: "returned", value: { kind: "int", value: 42 } },
  });
});
