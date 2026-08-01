import { describe, expect, test } from "bun:test";
import * as fc from "fast-check";
import { Effect } from "effect";
import {
  compileAndExecuteCheckedProgram,
  resumeCompiledExternalSuspension,
} from "../src/kernel-bytecode/custody.ts";
import {
  defaultKernelBytecodeBackendBounds,
  runCompiledKernelJsonBytes,
  runCompiledKernelJsonBytesWithObservationScript,
} from "../src/kernel-bytecode/index.ts";
import type { BytecodeExternalSuspension } from "../src/kernel-bytecode/vm.ts";
import {
  executePerturbedCheckedProgramForTest,
  resumePerturbedExternalSuspensionForTest,
} from "../src/kernel-bytecode/testing.ts";
import {
  driveExternalObservations,
  type ExternalEffectStep,
  type ExternalObservationScript,
} from "../src/kernel-execution/external-observations.ts";
import {
  encodeCanonicalKernelEffectRunObservation,
  defaultKernelInterpreterBounds,
  isKernelEffectRunObservation,
  interpretKernelJsonBytes,
  interpretKernelJsonBytesWithObservationScript,
  maximumExternalObservations,
} from "../src/kernel-interpreter/index.ts";
import { prepareKernelJsonBytes } from "../src/kernel-execution/prepare.ts";

const encoder = new TextEncoder();
const bytes = (value: unknown): Uint8Array => encoder.encode(JSON.stringify(value));
const document = (program: unknown, signature: ReadonlyArray<unknown>) =>
  bytes({
    format: "semantic.kernel-json",
    version: 1,
    kernel: "semantic.kernel-calculus/0018/v1",
    signature,
    program,
  });

const twoRequestProgram = document(
  {
    tag: "let",
    bound: {
      tag: "operation",
      grade: "1",
      label: "fresh",
      operation: "allocate",
      argument: { tag: "unit" },
    },
    body: {
      tag: "let",
      bound: {
        tag: "operation",
        grade: "1",
        label: "confirm",
        operation: "accept",
        argument: { tag: "bound-value", distance: 0 },
      },
      body: {
        tag: "return",
        grade: "1",
        value: { tag: "bound-value", distance: 0 },
      },
    },
  },
  [
    {
      label: "confirm",
      operation: "accept",
      argument_type: { tag: "int" },
      result_type: { tag: "bool" },
    },
    {
      label: "fresh",
      operation: "allocate",
      argument_type: { tag: "unit" },
      result_type: { tag: "int" },
    },
  ],
);

const repeatedRequestProgram = document(
  {
    tag: "let",
    bound: {
      tag: "operation",
      grade: "1",
      label: "fresh",
      operation: "allocate",
      argument: { tag: "unit" },
    },
    body: {
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
        value: {
          tag: "pair",
          first: { tag: "bound-value", distance: 1 },
          second: { tag: "bound-value", distance: 0 },
        },
      },
    },
  },
  [
    {
      label: "fresh",
      operation: "allocate",
      argument_type: { tag: "unit" },
      result_type: { tag: "int" },
    },
  ],
);

const thunkRequestProgram = document(
  {
    tag: "operation",
    grade: "1",
    label: "lazy",
    operation: "supply",
    argument: { tag: "unit" },
  },
  [
    {
      label: "lazy",
      operation: "supply",
      argument_type: { tag: "unit" },
      result_type: {
        tag: "thunk",
        effects: [],
        computation: { tag: "return", grade: "1", value: { tag: "int" } },
      },
    },
  ],
);

const pairRequestProgram = document(
  {
    tag: "operation",
    grade: "1",
    label: "choice",
    operation: "pair",
    argument: { tag: "unit" },
  },
  [
    {
      label: "choice",
      operation: "pair",
      argument_type: { tag: "unit" },
      result_type: {
        tag: "pair",
        first: { tag: "unit" },
        second: { tag: "bool" },
      },
    },
  ],
);

const perturbableRequestProgram = document(
  {
    tag: "let",
    bound: {
      tag: "operation",
      grade: "0",
      label: "fresh",
      operation: "allocate",
      argument: { tag: "unit" },
    },
    body: { tag: "return", grade: "1", value: { tag: "bool", value: true } },
  },
  [
    {
      label: "fresh",
      operation: "allocate",
      argument_type: { tag: "unit" },
      result_type: { tag: "int" },
    },
  ],
);

const script = (...observations: ReadonlyArray<unknown>) => ({
  format: "semantic.kernel-observation-script",
  version: 1,
  observations,
});

const both = (source: Uint8Array, observations: unknown) => {
  const reference = interpretKernelJsonBytesWithObservationScript(source, observations);
  const compiled = runCompiledKernelJsonBytesWithObservationScript(source, observations);
  expect(encodeCanonicalKernelEffectRunObservation(compiled)).toEqual(
    encodeCanonicalKernelEffectRunObservation(reference),
  );
  return reference;
};

describe("one-shot external effect replay", () => {
  test("drives two external requests to a returned value", () => {
    const result = both(
      twoRequestProgram,
      script({ kind: "int", value: 42 }, { kind: "bool", value: true }),
    );
    expect(result.observation).toEqual({
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
    expect(Object.isFrozen(result)).toBe(true);
  });

  test("a script prefix visibly stops at the final unanswered request", () => {
    const result = both(twoRequestProgram, script({ kind: "int", value: 7 }));
    expect(result.observation).toMatchObject({
      tag: "executed",
      provided_observations: 1,
      applied_observations: 1,
      requests: [{ label: "fresh" }, { label: "confirm" }],
      result: {
        tag: "suspended",
        request: { label: "confirm", argument: { kind: "int", value: 7 } },
      },
    });
  });

  test("extra observations remain visible and unapplied", () => {
    const result = both(
      twoRequestProgram,
      script({ kind: "int", value: 1 }, { kind: "bool", value: false }, { kind: "unit" }),
    );
    expect(result.observation).toMatchObject({
      tag: "executed",
      provided_observations: 3,
      applied_observations: 2,
      result: { tag: "returned", value: { kind: "bool", value: false } },
    });
  });

  test("wrong-typed and thunk-valued observations reject before application", () => {
    const wrong = both(twoRequestProgram, script({ kind: "bool", value: true }));
    expect(wrong.observation).toMatchObject({
      tag: "executed",
      applied_observations: 0,
      result: {
        tag: "runtime-rejected",
        diagnostic: { code: "external-observation.result-type-mismatch" },
      },
    });

    const thunk = both(thunkRequestProgram, script({ kind: "unit" }));
    expect(thunk.observation).toMatchObject({
      tag: "executed",
      applied_observations: 0,
      result: {
        tag: "runtime-rejected",
        diagnostic: { code: "external-observation.thunk-result-unsupported" },
      },
    });
  });

  test("repeated operations mint fresh affine suspensions", () => {
    const result = both(
      repeatedRequestProgram,
      script({ kind: "int", value: 3 }, { kind: "int", value: 5 }),
    );
    expect(result.observation).toMatchObject({
      tag: "executed",
      applied_observations: 2,
      requests: [{ label: "fresh" }, { label: "fresh" }],
      result: {
        tag: "returned",
        value: {
          kind: "pair",
          first: { kind: "int", value: 3 },
          second: { kind: "int", value: 5 },
        },
      },
    });
  });

  test("recursively typed pair and unit observations cross both machines", () => {
    const value = {
      kind: "pair",
      first: { kind: "unit" },
      second: { kind: "bool", value: true },
    } as const;
    const result = both(pairRequestProgram, script(value));
    expect(result.observation).toMatchObject({
      tag: "executed",
      applied_observations: 1,
      result: { tag: "returned", value },
    });
  });

  test("strict script rejection precedes kernel execution", () => {
    const invalid = both(new Uint8Array([0xff]), {
      ...script(),
      extra: true,
    });
    expect(invalid.observation).toMatchObject({
      tag: "script-rejected",
      diagnostics: [{ code: "external-observation-script.invalid" }],
    });

    const aliased = { kind: "unit" };
    const nonInert = both(twoRequestProgram, script(aliased, aliased));
    expect(nonInert.observation).toMatchObject({
      tag: "script-rejected",
      diagnostics: [{ code: "external-observation-script.non-inert" }],
    });

    const accessor = {
      format: "semantic.kernel-observation-script",
      version: 1,
      get observations() {
        throw new Error("must not be read");
      },
    };
    expect(both(twoRequestProgram, accessor).observation).toMatchObject({
      tag: "script-rejected",
      diagnostics: [{ code: "external-observation-script.non-inert" }],
    });

    const tooLong = both(
      twoRequestProgram,
      script(...Array.from({ length: maximumExternalObservations + 1 }, () => ({ kind: "unit" }))),
    );
    expect(tooLong.observation).toMatchObject({ tag: "script-rejected" });
  });

  test("existing first-suspension observations remain unchanged", () => {
    const reference = interpretKernelJsonBytes(twoRequestProgram);
    const compiled = runCompiledKernelJsonBytes(twoRequestProgram);
    expect(reference).toEqual(compiled);
    const replay = both(twoRequestProgram, script());
    expect(replay.observation).toMatchObject({
      tag: "executed",
      applied_observations: 0,
      result: reference.observation,
    });
  });

  test("an observation consumed before later fuel exhaustion remains applied", () => {
    const reference = interpretKernelJsonBytesWithObservationScript(
      twoRequestProgram,
      script({ kind: "int", value: 1 }),
      {
        ...defaultKernelInterpreterBounds,
        evaluation: { ...defaultKernelInterpreterBounds.evaluation, fuel: 2 },
      },
    );
    const compiled = runCompiledKernelJsonBytesWithObservationScript(
      twoRequestProgram,
      script({ kind: "int", value: 1 }),
      {
        ...defaultKernelBytecodeBackendBounds,
        bytecode: { ...defaultKernelBytecodeBackendBounds.bytecode, vmFuel: 2 },
      },
    );
    expect(reference.observation).toMatchObject({
      tag: "executed",
      provided_observations: 1,
      applied_observations: 1,
      requests: [{ label: "fresh" }],
      result: { tag: "inconclusive", reason: "fuel" },
    });
    expect(compiled.observation).toMatchObject({
      tag: "executed",
      provided_observations: 1,
      applied_observations: 1,
      requests: [{ label: "fresh" }],
      result: { tag: "inconclusive", reason: "fuel" },
    });
  });

  test("compiled custody rejects wrong, duplicate, and forged resume attempts", () => {
    const checked = Effect.runSync(prepareKernelJsonBytes(twoRequestProgram));
    const initial = Effect.runSync(
      compileAndExecuteCheckedProgram(checked.program, defaultKernelBytecodeBackendBounds.bytecode),
    );
    if (initial.status !== "suspended") throw new Error("expected initial suspension");

    const mismatch = Effect.runSync(
      Effect.flip(
        resumeCompiledExternalSuspension(
          initial.oneShotToken,
          { kind: "bool", value: true },
          defaultKernelBytecodeBackendBounds.bytecode,
        ),
      ),
    );
    expect(mismatch).toMatchObject({
      applied: false,
      error: { code: "bytecode.vm.external-resumption-result-type-mismatch" },
    });

    const resumed = Effect.runSync(
      resumeCompiledExternalSuspension(
        initial.oneShotToken,
        { kind: "int", value: 9 },
        defaultKernelBytecodeBackendBounds.bytecode,
      ),
    );
    expect(resumed.status).toBe("suspended");

    const duplicate = Effect.runSync(
      Effect.flip(
        resumeCompiledExternalSuspension(
          initial.oneShotToken,
          { kind: "int", value: 10 },
          defaultKernelBytecodeBackendBounds.bytecode,
        ),
      ),
    );
    expect(duplicate).toMatchObject({
      applied: false,
      error: { code: "bytecode.vm.external-resumption-already-used" },
    });

    const forged = Effect.runSync(
      Effect.flip(
        resumeCompiledExternalSuspension(
          { resultType: { kind: "int" } } as BytecodeExternalSuspension,
          { kind: "int", value: 1 },
          defaultKernelBytecodeBackendBounds.bytecode,
        ),
      ),
    );
    expect(forged).toMatchObject({
      applied: false,
      error: { code: "bytecode.vm.external-resumption-not-custodied" },
    });
  });

  test("foreign continuation custody rejects and an injected opcode divergence remains visible", () => {
    const checked = Effect.runSync(prepareKernelJsonBytes(perturbableRequestProgram));
    const perturbed = Effect.runSync(
      executePerturbedCheckedProgramForTest(
        checked.program,
        defaultKernelBytecodeBackendBounds.bytecode,
        "opcode",
      ),
    );
    if (perturbed.status !== "suspended") throw new Error("expected perturbed suspension");

    const foreign = Effect.runSync(
      Effect.flip(
        resumeCompiledExternalSuspension(
          perturbed.oneShotToken,
          { kind: "int", value: 1 },
          defaultKernelBytecodeBackendBounds.bytecode,
        ),
      ),
    );
    expect(foreign).toMatchObject({
      applied: false,
      error: { code: "bytecode.vm.external-resumption-not-custodied" },
    });

    const observationScript = script({ kind: "int", value: 1 }) as ExternalObservationScript;
    const perturbedRun = Effect.runSync(
      driveExternalObservations(
        {
          status: "suspended",
          request: perturbed.request,
          token: perturbed.oneShotToken,
        },
        observationScript,
        (token, value) =>
          Effect.match(
            resumePerturbedExternalSuspensionForTest(
              token,
              value,
              defaultKernelBytecodeBackendBounds.bytecode,
            ),
            {
              onFailure: (failure) => ({
                applied: failure.applied,
                step: {
                  status: "terminal",
                  result: {
                    tag: "runtime-rejected",
                    diagnostic: {
                      code:
                        "code" in failure.error ? failure.error.code : "bytecode.vm.inconclusive",
                      occurrence_path: "/program",
                      message: failure.error.message,
                    },
                  },
                } as ExternalEffectStep<BytecodeExternalSuspension>,
              }),
              onSuccess: (outcome) => ({
                applied: true,
                step: (outcome.status === "returned"
                  ? {
                      status: "returned",
                      result: { tag: "returned", value: outcome.value },
                    }
                  : {
                      status: "suspended",
                      request: outcome.request,
                      token: outcome.oneShotToken,
                    }) as ExternalEffectStep<BytecodeExternalSuspension>,
              }),
            },
          ),
      ),
    );
    expect(perturbedRun.observation).toMatchObject({
      tag: "executed",
      result: { tag: "returned", value: { kind: "unit" } },
    });
    const reference = interpretKernelJsonBytesWithObservationScript(
      perturbableRequestProgram,
      observationScript,
    );
    expect(reference.observation).toMatchObject({
      tag: "executed",
      result: { tag: "returned", value: { kind: "bool", value: true } },
    });
    expect(encodeCanonicalKernelEffectRunObservation(perturbedRun)).not.toEqual(
      encodeCanonicalKernelEffectRunObservation(reference),
    );
  });

  test("the public effect-run schema rejects impossible forged counters", () => {
    const valid = both(twoRequestProgram, script({ kind: "int", value: 1 }));
    if (valid.observation.tag !== "executed") throw new Error("expected executed result");
    const representationRejected = interpretKernelJsonBytes(new Uint8Array([0xff])).observation;
    if (representationRejected.tag !== "representation-rejected") {
      throw new Error("expected representation rejection fixture");
    }
    const checkRejected = interpretKernelJsonBytes(
      document(
        {
          tag: "return",
          grade: "1",
          value: { tag: "bound-value", distance: 0 },
        },
        [],
      ),
    ).observation;
    if (checkRejected.tag !== "check-rejected") {
      throw new Error("expected check rejection fixture");
    }
    expect(
      isKernelEffectRunObservation({
        ...valid,
        observation: {
          ...valid.observation,
          provided_observations: maximumExternalObservations + 1,
        },
      }),
    ).toBe(false);
    expect(
      isKernelEffectRunObservation({
        ...valid,
        observation: {
          ...valid.observation,
          applied_observations: 2,
          requests: [],
        },
      }),
    ).toBe(false);
    expect(
      isKernelEffectRunObservation({
        ...valid,
        observation: {
          ...valid.observation,
          result: { tag: "returned", value: { kind: "unit" } },
        },
      }),
    ).toBe(false);
    expect(
      isKernelEffectRunObservation({
        ...valid,
        observation: {
          ...valid.observation,
          result: { tag: "inconclusive", reason: "fuel" },
        },
      }),
    ).toBe(false);
    expect(
      isKernelEffectRunObservation({
        ...valid,
        observation: {
          ...valid.observation,
          result: {
            tag: "runtime-rejected",
            diagnostic: {
              code: "forged.runtime-rejection",
              occurrence_path: "$",
              message: "forged terminal result with no unused observation",
            },
          },
        },
      }),
    ).toBe(false);
    expect(
      isKernelEffectRunObservation({
        ...valid,
        observation: {
          ...valid.observation,
          requests: [structuredClone(valid.observation.requests[0])],
          result: representationRejected,
        },
      }),
    ).toBe(false);
    expect(
      isKernelEffectRunObservation({
        ...valid,
        observation: {
          ...valid.observation,
          requests: [structuredClone(valid.observation.requests[0])],
          result: checkRejected,
        },
      }),
    ).toBe(false);
    expect(
      isKernelEffectRunObservation({
        ...valid,
        observation: {
          ...valid.observation,
          requests: [structuredClone(valid.observation.requests[0])],
          result: {
            tag: "suspended",
            request: structuredClone(valid.observation.requests[0]),
          },
        },
      }),
    ).toBe(false);
    expect(
      isKernelEffectRunObservation({
        ...valid,
        observation: {
          ...valid.observation,
          provided_observations: valid.observation.applied_observations + 1,
        },
      }),
    ).toBe(false);
    expect(
      isKernelEffectRunObservation({
        ...valid,
        observation: {
          ...valid.observation,
          result: {
            tag: "suspended",
            request: {
              label: "forged",
              operation: "request",
              argument: { kind: "unit" },
              result_type: { kind: "unit" },
            },
          },
        },
      }),
    ).toBe(false);
  });

  test("generated two-request scripts agree as canonical bytes", () => {
    fc.assert(
      fc.property(fc.integer({ min: -10_000, max: 10_000 }), fc.boolean(), (integer, boolean) => {
        const result = both(
          twoRequestProgram,
          script({ kind: "int", value: integer }, { kind: "bool", value: boolean }),
        );
        expect(isKernelEffectRunObservation(result)).toBe(true);
      }),
      { seed: 0x0037aff1, numRuns: 128 },
    );
  });
});
