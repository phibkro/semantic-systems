import { describe, expect, test } from "bun:test";
import * as fc from "fast-check";
import {
  canonicalKernelRunObservationJson,
  encodeCanonicalKernelRunObservation,
  interpretKernelJsonBytes,
  isKernelRunObservation,
  toPortableFact,
  type KernelRunObservation,
} from "../src/kernel-interpreter/index.ts";
import {
  checkKernelDocument,
  decodeKernelDocumentBytes,
  defaultKernelJsonRawBounds,
} from "../src/kernel-json/index.ts";

type PrimitiveNode =
  | { readonly tag: "unit" }
  | { readonly tag: "bool"; readonly value: boolean }
  | { readonly tag: "int"; readonly value: number };

type ValueNode =
  | PrimitiveNode
  | { readonly tag: "pair"; readonly first: ValueNode; readonly second: ValueNode };

const encoder = new TextEncoder();
const bytes = (value: unknown): Uint8Array => encoder.encode(JSON.stringify(value));

const document = (program: unknown, signature: ReadonlyArray<unknown> = []) => ({
  format: "semantic.kernel-json",
  version: 1,
  kernel: "semantic.kernel-calculus/0018/v1",
  signature,
  program,
});

const primitiveArbitrary: fc.Arbitrary<PrimitiveNode> = fc.oneof(
  fc.constant({ tag: "unit" } as const),
  fc.boolean().map((value) => ({ tag: "bool" as const, value })),
  fc.integer({ min: -1_000_000, max: 1_000_000 }).map((value) => ({ tag: "int" as const, value })),
);

const valueArbitrary: fc.Arbitrary<ValueNode> = fc
  .array(primitiveArbitrary, { maxLength: 12 })
  .map((leaves) => {
    let value: ValueNode = leaves.at(-1) ?? { tag: "unit" };
    for (let index = leaves.length - 2; index >= 0; index -= 1) {
      value = { tag: "pair", first: leaves[index]!, second: value };
    }
    return value;
  });

const typeOfValueNode = (node: ValueNode): unknown => {
  switch (node.tag) {
    case "unit":
      return { tag: "unit" };
    case "bool":
      return { tag: "bool" };
    case "int":
      return { tag: "int" };
    case "pair":
      return {
        tag: "pair",
        first: typeOfValueNode(node.first),
        second: typeOfValueNode(node.second),
      };
  }
};

// A guaranteed-incompatible declared type for the same node: top-level tag
// mismatch alone is sufficient for value-type inequality, so every case
// below reaches `type.argument-mismatch` deterministically.
const mismatchedTypeOfValueNode = (node: ValueNode): unknown => {
  switch (node.tag) {
    case "int":
      return { tag: "bool" };
    case "bool":
      return { tag: "int" };
    case "unit":
      return { tag: "int" };
    case "pair":
      return { tag: "unit" };
  }
};

// Every variant below reduces to exactly `return value`: covering `let`,
// `force`/`thunk`, and `lambda`/`apply` alongside the bare `return` keeps the
// existing "reduces to the generated value" properties meaningful while
// exercising every non-handler term constructor the 0018 grammar admits.
const pureProgramFromValue = (value: ValueNode): fc.Arbitrary<Record<string, unknown>> =>
  fc.oneof(
    fc.constant(document({ tag: "return", grade: "1", value })),
    fc.constant(
      document({
        tag: "let",
        bound: { tag: "return", grade: "1", value },
        body: { tag: "return", grade: "1", value: { tag: "bound-value", distance: 0 } },
      }),
    ),
    fc.constant(
      document({
        tag: "force",
        value: { tag: "thunk", body: { tag: "return", grade: "1", value } },
      }),
    ),
    fc.constant(
      document({
        tag: "apply",
        computation: {
          tag: "lambda",
          parameter_type: typeOfValueNode(value),
          grade: "1",
          body: { tag: "return", grade: "1", value: { tag: "bound-value", distance: 0 } },
        },
        argument: value,
      }),
    ),
  );

const pureDocumentArbitrary: fc.Arbitrary<Record<string, unknown>> =
  valueArbitrary.chain(pureProgramFromValue);

const typeMismatchedApplyDocumentArbitrary: fc.Arbitrary<Record<string, unknown>> =
  valueArbitrary.map((value) =>
    document({
      tag: "apply",
      computation: {
        tag: "lambda",
        parameter_type: mismatchedTypeOfValueNode(value),
        grade: "1",
        body: { tag: "return", grade: "1", value: { tag: "bound-value", distance: 0 } },
      },
      argument: value,
    }),
  );

const handledDocumentArbitrary = fc.integer({ min: -1_000_000, max: 1_000_000 }).map((value) =>
  document(
    {
      tag: "handle",
      label: "generated",
      computation: {
        tag: "operation",
        grade: "1",
        label: "generated",
        operation: "choose",
        argument: { tag: "unit" },
      },
      return_clause: {
        body: {
          tag: "return",
          grade: "1",
          value: { tag: "bound-value", distance: 0 },
        },
      },
      operation_clauses: [
        {
          operation: "choose",
          body: {
            tag: "resume",
            resumption_distance: 0,
            value: { tag: "int", value },
          },
        },
      ],
    },
    [
      {
        label: "generated",
        operation: "choose",
        argument_type: { tag: "unit" },
        result_type: { tag: "int" },
      },
    ],
  ),
);

// Sequences two resumes of the same one-shot binder through a `let`, in the
// exact shape of the frozen `rejected-double-resume` golden: the affine-
// usage boundary, generated rather than fixed.
const doubleResumeHandledDocumentArbitrary: fc.Arbitrary<Record<string, unknown>> = fc
  .tuple(
    fc.integer({ min: -1_000_000, max: 1_000_000 }),
    fc.integer({ min: -1_000_000, max: 1_000_000 }),
  )
  .map(([first, second]) =>
    document(
      {
        tag: "handle",
        label: "generated",
        computation: {
          tag: "operation",
          grade: "1",
          label: "generated",
          operation: "choose",
          argument: { tag: "unit" },
        },
        return_clause: {
          body: { tag: "return", grade: "1", value: { tag: "bound-value", distance: 0 } },
        },
        operation_clauses: [
          {
            operation: "choose",
            body: {
              tag: "let",
              bound: { tag: "resume", resumption_distance: 0, value: { tag: "int", value: first } },
              body: { tag: "resume", resumption_distance: 0, value: { tag: "int", value: second } },
            },
          },
        ],
      },
      [
        {
          label: "generated",
          operation: "choose",
          argument_type: { tag: "unit" },
          result_type: { tag: "int" },
        },
      ],
    ),
  );

const assertDeeplyFrozen = (input: unknown, seen = new WeakSet<object>()): void => {
  if (typeof input !== "object" || input === null || seen.has(input)) return;
  seen.add(input);
  expect(Object.isFrozen(input)).toBeTrue();
  for (const value of Object.values(input)) assertDeeplyFrozen(value, seen);
};

const propertyConfiguration = Object.freeze({ seed: 0x0022, numRuns: 200 });

describe("kernel reference interpreter examples", () => {
  test("the composition boundary keeps ambient authority and unchecked evaluation out", async () => {
    const source = await Bun.file(
      new URL("../src/kernel-interpreter/observe.ts", import.meta.url),
    ).text();
    for (const forbidden of [
      "JSON.parse",
      'from "node:',
      "Bun.",
      "process.",
      "Math.random",
      "fetch(",
      "console.",
    ]) {
      expect(source).not.toContain(forbidden);
    }
    expect(source).toContain("evaluate(checked.program");
    expect(source).not.toContain("evaluate(projected.value");
  });

  test("selected observations equal the portable golden bytes", async () => {
    for (const name of ["pure-program", "handled-program", "rejected-double-resume"] as const) {
      const source = new Uint8Array(
        await Bun.file(
          new URL(`../examples/kernel-json/${name}.kernel.json`, import.meta.url),
        ).arrayBuffer(),
      );
      const expected = new Uint8Array(
        await Bun.file(
          new URL(`../examples/kernel-json/${name}.kernel-run.json.golden`, import.meta.url),
        ).arrayBuffer(),
      );
      expect(encodeCanonicalKernelRunObservation(interpretKernelJsonBytes(source))).toEqual(
        expected,
      );
    }
  });

  test("pure and fully handled programs return implementation-neutral values", async () => {
    const pure = interpretKernelJsonBytes(
      new Uint8Array(
        await Bun.file(
          new URL("../examples/kernel-json/pure-program.kernel.json", import.meta.url),
        ).arrayBuffer(),
      ),
    );
    const handled = interpretKernelJsonBytes(
      new Uint8Array(
        await Bun.file(
          new URL("../examples/kernel-json/handled-program.kernel.json", import.meta.url),
        ).arrayBuffer(),
      ),
    );
    expect(pure.observation).toEqual({ tag: "returned", value: { kind: "int", value: 42 } });
    expect(handled.observation).toEqual({ tag: "returned", value: { kind: "int", value: 7 } });
    assertDeeplyFrozen(pure);
    assertDeeplyFrozen(handled);
  });

  test("an unhandled operation becomes an explicit suspension without a token identity", () => {
    const observation = interpretKernelJsonBytes(
      bytes(
        document(
          {
            tag: "operation",
            grade: "1",
            label: "outside",
            operation: "read",
            argument: { tag: "bool", value: true },
          },
          [
            {
              label: "outside",
              operation: "read",
              argument_type: { tag: "bool" },
              result_type: { tag: "int" },
            },
          ],
        ),
      ),
    );
    expect(observation.observation).toEqual({
      tag: "suspended",
      request: {
        label: "outside",
        operation: "read",
        argument: { kind: "bool", value: true },
        result_type: { kind: "int" },
      },
    });
    expect(canonicalKernelRunObservationJson(observation)).not.toContain("token");
  });

  test("representation and semantic mistakes remain in their owning phase", async () => {
    const malformed = interpretKernelJsonBytes(
      bytes({ ...document({ tag: "unit" }), extra: true }),
    );
    expect(malformed.observation).toMatchObject({
      tag: "representation-rejected",
      diagnostics: [{ code: "decode.excess-property" }],
    });

    const rejected = interpretKernelJsonBytes(
      new Uint8Array(
        await Bun.file(
          new URL("../examples/kernel-json/rejected-double-resume.kernel.json", import.meta.url),
        ).arrayBuffer(),
      ),
    );
    expect(rejected.observation.tag).toBe("check-rejected");
    if (rejected.observation.tag === "check-rejected") {
      expect(rejected.observation.check.observation.tag).toBe("rejected");
    }
  });

  test("resource exhaustion is inconclusive and wider caller bounds are narrowed", () => {
    const source = bytes(document({ tag: "return", grade: "1", value: { tag: "unit" } }));
    expect(
      interpretKernelJsonBytes(source, {
        json: {
          maximumBytes: 1_048_576,
          maximumDepth: 128,
          maximumNodes: 524_288,
          maximumStringBytes: 4_096,
          maximumCollectionLength: 4_096,
          maximumOperations: 256,
          maximumOperationClauses: 256,
          maximumEffectLabels: 256,
        },
        evaluation: { fuel: 0, maximumTraceEntries: 10_000 },
      }).observation,
    ).toEqual({ tag: "inconclusive", reason: "fuel" });

    const widened = interpretKernelJsonBytes(source, {
      json: {
        maximumBytes: 1_048_577,
        maximumDepth: 129,
        maximumNodes: 524_289,
        maximumStringBytes: 4_097,
        maximumCollectionLength: 4_097,
        maximumOperations: 257,
        maximumOperationClauses: 257,
        maximumEffectLabels: 257,
      },
      evaluation: { fuel: 20_000, maximumTraceEntries: 20_000 },
    });
    expect(widened.observation).toEqual({ tag: "returned", value: { kind: "unit" } });
  });
});

describe("kernel reference interpreter generated evidence", () => {
  test("valid pure programs are deterministic, canonical, strict, and immutable", () => {
    fc.assert(
      fc.property(pureDocumentArbitrary, (candidate) => {
        const first = interpretKernelJsonBytes(bytes(candidate));
        const second = interpretKernelJsonBytes(bytes(candidate));
        expect(first.observation.tag).toBe("returned");
        expect(encodeCanonicalKernelRunObservation(first)).toEqual(
          encodeCanonicalKernelRunObservation(second),
        );
        expect(isKernelRunObservation(JSON.parse(canonicalKernelRunObservationJson(first)))).toBe(
          true,
        );
        assertDeeplyFrozen(first);
      }),
      propertyConfiguration,
    );
  });

  test("valid fully handled programs return the generated result", () => {
    fc.assert(
      fc.property(handledDocumentArbitrary, (candidate) => {
        expect(interpretKernelJsonBytes(bytes(candidate)).observation.tag).toBe("returned");
      }),
      propertyConfiguration,
    );
  });

  test("representation-invalid mutations cannot leak into checking", () => {
    fc.assert(
      fc.property(pureDocumentArbitrary, fc.boolean(), (candidate, marker) => {
        const result = interpretKernelJsonBytes(bytes({ ...candidate, unexpected: marker }));
        expect(result.observation.tag).toBe("representation-rejected");
      }),
      propertyConfiguration,
    );
  });

  test("closed-program scope mutations remain semantic rejections", () => {
    fc.assert(
      fc.property(fc.nat({ max: 1_000 }), (distance) => {
        const result = interpretKernelJsonBytes(
          bytes(
            document({
              tag: "return",
              grade: "1",
              value: { tag: "bound-value", distance },
            }),
          ),
        );
        expect(result.observation.tag).toBe("check-rejected");
      }),
      propertyConfiguration,
    );
  });

  test("a declared-vs-actual apply argument type mismatch is a semantic, not representation, rejection", () => {
    fc.assert(
      fc.property(typeMismatchedApplyDocumentArbitrary, (candidate) => {
        const result = interpretKernelJsonBytes(bytes(candidate));
        expect(result.observation.tag).toBe("check-rejected");
        if (result.observation.tag !== "check-rejected") return;
        expect(result.observation.check.observation.diagnostics[0]?.code).toBe(
          "type.argument-mismatch",
        );
      }),
      propertyConfiguration,
    );
  });

  test("a double-resumed one-shot binder is rejected with usage.affine-duplicated", () => {
    fc.assert(
      fc.property(doubleResumeHandledDocumentArbitrary, (candidate) => {
        const result = interpretKernelJsonBytes(bytes(candidate));
        expect(result.observation.tag).toBe("check-rejected");
        if (result.observation.tag !== "check-rejected") return;
        expect(result.observation.check.observation.diagnostics[0]?.code).toBe(
          "usage.affine-duplicated",
        );
      }),
      propertyConfiguration,
    );
  });
});

describe("kernel run observation schema", () => {
  const internalRejection: KernelRunObservation = {
    format: "semantic.kernel-run",
    version: 1,
    kernel: "semantic.kernel-calculus/0018/v1",
    observation: {
      tag: "runtime-rejected",
      diagnostic: {
        code: "interpreter.example",
        occurrence_path: "/program",
        message: "example stable internal diagnostic",
        expected: { kind: "int" },
        actual: { kind: "bool" },
      },
    },
  };

  test("accepts the defensive runtime rejection and rejects excess properties", () => {
    expect(isKernelRunObservation(internalRejection)).toBe(true);
    expect(
      isKernelRunObservation({
        ...internalRejection,
        observation: { ...internalRejection.observation, trace: [] },
      }),
    ).toBe(false);
  });

  test("a check-rejected tag cannot wrap an accepted check observation", async () => {
    const source = new Uint8Array(
      await Bun.file(
        new URL("../examples/kernel-json/pure-program.kernel.json", import.meta.url),
      ).arrayBuffer(),
    );
    const decoded = decodeKernelDocumentBytes(source);
    expect(decoded.status).toBe("decoded");
    if (decoded.status !== "decoded") return;
    const acceptedCheck = checkKernelDocument(decoded.value);
    expect(acceptedCheck.observation.tag).toBe("accepted");
    expect(
      isKernelRunObservation({
        format: "semantic.kernel-run",
        version: 1,
        kernel: "semantic.kernel-calculus/0018/v1",
        observation: { tag: "check-rejected", check: acceptedCheck },
      }),
    ).toBe(false);
  });
});

describe("toPortableFact: strict inert canonical JSON boundary (post-merge review)", () => {
  test("rejects Date, Map, Set, and RegExp instead of silently rendering an empty record", () => {
    expect(toPortableFact(new Date())).toBeUndefined();
    expect(toPortableFact(new Map([["a", 1]]))).toBeUndefined();
    expect(toPortableFact(new Set([1, 2]))).toBeUndefined();
    expect(toPortableFact(/x/)).toBeUndefined();
  });

  test("rejects a class instance with an inherited prototype", () => {
    class Boxed {
      constructor(public readonly value: number) {}
    }
    expect(toPortableFact(new Boxed(1))).toBeUndefined();
  });

  test("accepts a null-prototype plain record but rejects every other exotic prototype", () => {
    const nullProto: Record<string, unknown> = Object.create(null);
    nullProto["a"] = 1;
    expect(toPortableFact(nullProto)).toEqual({ a: 1 });

    const exoticArray = Object.create(Array.prototype) as unknown;
    expect(toPortableFact(exoticArray)).toBeUndefined();
  });

  test("rejects a symbol-keyed property and an accessor property, at any depth", () => {
    const withSymbol: Record<PropertyKey, unknown> = { a: 1 };
    withSymbol[Symbol("s")] = 2;
    expect(toPortableFact(withSymbol)).toBeUndefined();
    expect(toPortableFact({ nested: withSymbol })).toBeUndefined();

    const withAccessor: Record<string, unknown> = {};
    Object.defineProperty(withAccessor, "a", { get: () => 1, enumerable: true });
    expect(toPortableFact(withAccessor)).toBeUndefined();
  });

  test("rejects a self-cycle", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic["self"] = cyclic;
    expect(toPortableFact(cyclic)).toBeUndefined();
  });

  test("rejects a non-cyclic diamond alias, not only true self-cycles", () => {
    const shared = { a: 1 };
    const diamond = { left: shared, right: shared };
    expect(toPortableFact(diamond)).toBeUndefined();
    // An independent, structurally-equal duplicate is not the same
    // reference, so it is not an alias and projects faithfully.
    expect(toPortableFact({ left: { a: 1 }, right: { a: 1 } })).toEqual({
      left: { a: 1 },
      right: { a: 1 },
    });
  });

  test("rejects a sparse array and an array carrying a non-index own property", () => {
    const sparse: Array<unknown> = [];
    sparse[2] = 1;
    expect(toPortableFact(sparse)).toBeUndefined();

    const extraKeyed: Array<unknown> = [1, 2];
    (extraKeyed as unknown as Record<string, unknown>)["extra"] = 3;
    expect(toPortableFact(extraKeyed)).toBeUndefined();
  });

  test("rejects every non-injective or non-representable primitive kind", () => {
    expect(toPortableFact(1.5)).toBeUndefined();
    expect(toPortableFact(Number.MAX_SAFE_INTEGER + 10)).toBeUndefined();
    expect(toPortableFact(Number.NaN)).toBeUndefined();
    expect(toPortableFact(Number.POSITIVE_INFINITY)).toBeUndefined();
    expect(toPortableFact(undefined)).toBeUndefined();
    expect(toPortableFact(() => {})).toBeUndefined();
    expect(toPortableFact(Symbol("s"))).toBeUndefined();
    expect(toPortableFact(10n)).toBeUndefined();
  });

  test("accepts every representable primitive and faithfully nested structure", () => {
    expect(toPortableFact(null)).toBeNull();
    expect(toPortableFact(true)).toBe(true);
    expect(toPortableFact("x")).toBe("x");
    expect(toPortableFact(7)).toBe(7);
    expect(toPortableFact(-0)).toBe(-0);
    expect(toPortableFact({ a: [1, "b", { c: true, d: null }] })).toEqual({
      a: [1, "b", { c: true, d: null }],
    });
  });

  test("negative zero and positive zero are distinct, injective facts through full canonical encoding", () => {
    // The accepted 0018/0019/0020 contracts already preserve -0 as a value
    // distinct from 0 through canonical encoding (`Object.is(-0, 0)` is
    // `false`, and `canonicalJson` emits the literal tokens "-0" and "0").
    // Accepting -0 here does not collapse two non-interchangeable host
    // values into one canonical fact; proving the two encode to different
    // bytes is the injectivity property that actually matters, not banning
    // the value.
    const negativeZeroBytes = canonicalKernelRunObservationJson({
      format: "semantic.kernel-run",
      version: 1,
      kernel: "semantic.kernel-calculus/0018/v1",
      observation: {
        tag: "runtime-rejected",
        diagnostic: {
          code: "interpreter.example",
          occurrence_path: "/program",
          message: "m",
          actual: toPortableFact(-0),
        },
      },
    } as never);
    const positiveZeroBytes = canonicalKernelRunObservationJson({
      format: "semantic.kernel-run",
      version: 1,
      kernel: "semantic.kernel-calculus/0018/v1",
      observation: {
        tag: "runtime-rejected",
        diagnostic: {
          code: "interpreter.example",
          occurrence_path: "/program",
          message: "m",
          actual: toPortableFact(0),
        },
      },
    } as never);
    expect(negativeZeroBytes).toContain('"actual":-0');
    expect(positiveZeroBytes).toContain('"actual":0');
    expect(negativeZeroBytes).not.toBe(positiveZeroBytes);
  });

  test("an own __proto__ key projects as an ordinary data property, never mutating the output's prototype", () => {
    const hostile: Record<string, unknown> = {};
    Object.defineProperty(hostile, "__proto__", {
      value: 5,
      enumerable: true,
      configurable: true,
      writable: true,
    });
    const projected = toPortableFact(hostile);
    expect(projected).toBeDefined();
    const record = projected as Record<string, unknown>;
    expect(
      Object.getPrototypeOf(record) === null || Object.getPrototypeOf(record) === Object.prototype,
    ).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(record, "__proto__")).toBe(true);
    expect(record["__proto__"]).toBe(5);
    expect(
      canonicalKernelRunObservationJson({
        format: "semantic.kernel-run",
        version: 1,
        kernel: "semantic.kernel-calculus/0018/v1",
        observation: {
          tag: "runtime-rejected",
          diagnostic: {
            code: "interpreter.example",
            occurrence_path: "/program",
            message: "m",
            actual: hostile,
          },
        },
      } as never),
    ).toContain('"__proto__":5');
  });

  test("a revoked proxy is rejected, never escaping as a host error", () => {
    const { proxy, revoke } = Proxy.revocable({ a: 1 }, {});
    revoke();
    expect(() => toPortableFact(proxy)).not.toThrow();
    expect(toPortableFact(proxy)).toBeUndefined();
    expect(() => toPortableFact({ nested: proxy })).not.toThrow();
    expect(toPortableFact({ nested: proxy })).toBeUndefined();
  });

  test("a proxy whose ownKeys or getPrototypeOf trap throws is rejected, never escaping as a host error", () => {
    const throwingOwnKeys = new Proxy(
      { a: 1 },
      {
        ownKeys() {
          throw new Error("hostile ownKeys");
        },
      },
    );
    expect(() => toPortableFact(throwingOwnKeys)).not.toThrow();
    expect(toPortableFact(throwingOwnKeys)).toBeUndefined();

    const throwingPrototype = new Proxy(
      { a: 1 },
      {
        getPrototypeOf() {
          throw new Error("hostile getPrototypeOf");
        },
      },
    );
    expect(() => toPortableFact(throwingPrototype)).not.toThrow();
    expect(toPortableFact(throwingPrototype)).toBeUndefined();

    const throwingArrayOwnKeys = new Proxy([1, 2], {
      ownKeys() {
        throw new Error("hostile array ownKeys");
      },
    });
    expect(() => toPortableFact(throwingArrayOwnKeys)).not.toThrow();
    expect(toPortableFact(throwingArrayOwnKeys)).toBeUndefined();
  });

  test("array projection reads every element from one descriptor snapshot, never a later live access", () => {
    let liveIndexReads = 0;
    let liveLengthReads = 0;
    const proxy = new Proxy([1, 2, 3], {
      get(target, prop, receiver) {
        if (prop === "length") liveLengthReads += 1;
        else if (typeof prop === "string" && /^\d+$/.test(prop)) liveIndexReads += 1;
        return Reflect.get(target, prop, receiver);
      },
    });
    expect(toPortableFact(proxy)).toEqual([1, 2, 3]);
    // `Object.getOwnPropertyDescriptors` uses the `getOwnPropertyDescriptor`
    // trap, not `get`; a zero count here proves the implementation never
    // falls back to a second, independent live read of `length` or an
    // index after validating the snapshot.
    expect(liveLengthReads).toBe(0);
    expect(liveIndexReads).toBe(0);
  });

  test("a descriptor snapshot that disagrees with a would-be live read is what actually gets projected", () => {
    // A hostile proxy whose `get` trap would answer differently than its
    // `getOwnPropertyDescriptor` trap. If the implementation ever read
    // through `get` after validating through descriptors, this would
    // project a `Date` (and so reject); reading only the one snapshot
    // must instead see the descriptor's own safe-integer value.
    const proxy = new Proxy([0], {
      getOwnPropertyDescriptor(target, prop) {
        if (prop === "0")
          return { value: 42, writable: true, enumerable: true, configurable: true };
        return Object.getOwnPropertyDescriptor(target, prop);
      },
      get(target, prop, receiver) {
        if (prop === "0") return new Date(2020, 0, 1);
        return Reflect.get(target, prop, receiver);
      },
    });
    expect(toPortableFact(proxy)).toEqual([42]);
  });
});

describe("the public schema boundary rejects the same hostile facts as toPortableFact (post-merge review)", () => {
  const observationWithFact = (fact: unknown) =>
    ({
      format: "semantic.kernel-run",
      version: 1,
      kernel: "semantic.kernel-calculus/0018/v1",
      observation: {
        tag: "runtime-rejected",
        diagnostic: {
          code: "interpreter.example",
          occurrence_path: "/program",
          message: "m",
          actual: fact,
        },
      },
    }) as never;

  test("isKernelRunObservation rejects every fact toPortableFact rejects, directly supplied", () => {
    class Boxed {
      constructor(public readonly value: number) {}
    }
    const cyclic: Record<string, unknown> = {};
    cyclic["self"] = cyclic;
    const shared = { a: 1 };
    const diamond = { left: shared, right: shared };
    const withAccessor: Record<string, unknown> = {};
    Object.defineProperty(withAccessor, "a", { get: () => 1, enumerable: true });
    const { proxy: revoked, revoke } = Proxy.revocable({}, {});
    revoke();

    for (const hostile of [
      new Date(),
      new Map([["a", 1]]),
      new Set([1]),
      /x/,
      new Boxed(1),
      cyclic,
      diamond,
      withAccessor,
      revoked,
    ]) {
      const observation = observationWithFact(hostile);
      expect(isKernelRunObservation(observation)).toBe(false);
      expect(() => encodeCanonicalKernelRunObservation(observation)).toThrow();
      expect(() => canonicalKernelRunObservationJson(observation)).toThrow();
    }
  });

  test("isKernelRunObservation and both canonical encoders accept valid nested facts and negative zero", () => {
    for (const portable of [
      { a: [1, "b", { c: true, d: null }] },
      -0,
      0,
      "text",
      null,
      true,
      [1, 2, 3],
    ]) {
      const observation = observationWithFact(portable);
      expect(isKernelRunObservation(observation)).toBe(true);
      expect(() => encodeCanonicalKernelRunObservation(observation)).not.toThrow();
      expect(() => canonicalKernelRunObservationJson(observation)).not.toThrow();
    }
  });

  test("an observation entirely omitting expected/actual remains valid: absence is not an invalid present value", () => {
    const observation = {
      format: "semantic.kernel-run",
      version: 1,
      kernel: "semantic.kernel-calculus/0018/v1",
      observation: {
        tag: "runtime-rejected",
        diagnostic: { code: "interpreter.example", occurrence_path: "/program", message: "m" },
      },
    };
    expect(isKernelRunObservation(observation)).toBe(true);
  });
});

describe("interpretKernelJsonBytes bounds totality (post-merge review)", () => {
  const pureUnitSource = bytes(document({ tag: "return", grade: "1", value: { tag: "unit" } }));
  const expectedUnitObservation = { tag: "returned", value: { kind: "unit" } } as const;

  test("null bounds, and null bounds.json/bounds.evaluation, never throw and fall back to defaults", () => {
    expect(() => interpretKernelJsonBytes(pureUnitSource, null as never)).not.toThrow();
    expect(interpretKernelJsonBytes(pureUnitSource, null as never).observation).toEqual(
      expectedUnitObservation,
    );
    expect(
      interpretKernelJsonBytes(pureUnitSource, { json: null, evaluation: null } as never)
        .observation,
    ).toEqual(expectedUnitObservation);
  });

  test("a non-object, wrong-typed, or partially shaped bounds record never throws", () => {
    for (const malformed of [
      "not an object",
      42,
      [],
      { json: "nope", evaluation: 7 },
      { json: {}, evaluation: {} },
      { json: { maximumBytes: "huge" }, evaluation: { fuel: "lots" } },
      { json: undefined, evaluation: { fuel: 5 } },
    ]) {
      expect(() => interpretKernelJsonBytes(pureUnitSource, malformed as never)).not.toThrow();
    }
  });

  test("a hostile accessor bound is read exactly once, never re-checked against a later value", () => {
    let reads = 0;
    const hostileEvaluation = {
      get fuel() {
        reads += 1;
        // A validate-then-use race would let the second read's huge value
        // escape the intended default ceiling; reading exactly once closes
        // that race by construction.
        return reads === 1 ? 5 : 999_999_999;
      },
      maximumTraceEntries: 10,
    };
    const result = interpretKernelJsonBytes(pureUnitSource, {
      json: undefined,
      evaluation: hostileEvaluation,
    } as never);
    expect(reads).toBe(1);
    expect(result.observation).toEqual(expectedUnitObservation);
  });

  test("a malformed or extreme supplied bound never resolves wider than the exact default", () => {
    const withAbsentEvaluation = interpretKernelJsonBytes(pureUnitSource, {
      json: defaultKernelJsonRawBounds,
      evaluation: undefined,
    } as never);
    const withHugeEvaluation = interpretKernelJsonBytes(pureUnitSource, {
      json: defaultKernelJsonRawBounds,
      evaluation: { fuel: Number.MAX_SAFE_INTEGER, maximumTraceEntries: Number.MAX_SAFE_INTEGER },
    });
    // An absent bound falling back to the default and a huge supplied bound
    // capped at the same default must be indistinguishable: neither ever
    // resolves wider than that one ceiling.
    expect(canonicalKernelRunObservationJson(withAbsentEvaluation)).toBe(
      canonicalKernelRunObservationJson(withHugeEvaluation),
    );
  });

  test("a throwing outer bounds.json/bounds.evaluation accessor never escapes as a host error", () => {
    const hostileBounds = {
      get json(): never {
        throw new Error("hostile outer json accessor");
      },
      get evaluation(): never {
        throw new Error("hostile outer evaluation accessor");
      },
    };
    expect(() => interpretKernelJsonBytes(pureUnitSource, hostileBounds as never)).not.toThrow();
    expect(interpretKernelJsonBytes(pureUnitSource, hostileBounds as never).observation).toEqual(
      expectedUnitObservation,
    );
  });

  test("a revoked or hostile-trap Proxy standing in for bounds never escapes as a host error", () => {
    const { proxy: revokedBounds, revoke } = Proxy.revocable(
      { json: defaultKernelJsonRawBounds, evaluation: { fuel: 1, maximumTraceEntries: 1 } },
      {},
    );
    revoke();
    expect(() => interpretKernelJsonBytes(pureUnitSource, revokedBounds as never)).not.toThrow();
    expect(interpretKernelJsonBytes(pureUnitSource, revokedBounds as never).observation).toEqual(
      expectedUnitObservation,
    );

    const throwingGetBounds = new Proxy(
      {},
      {
        get() {
          throw new Error("hostile get trap");
        },
      },
    );
    expect(() =>
      interpretKernelJsonBytes(pureUnitSource, throwingGetBounds as never),
    ).not.toThrow();
    expect(
      interpretKernelJsonBytes(pureUnitSource, throwingGetBounds as never).observation,
    ).toEqual(expectedUnitObservation);
  });
});

describe("both public encoders validate and encode the same one snapshot (post-merge review)", () => {
  // The descriptor-safe/live-read proxy from the array-projection regression
  // above, placed directly as a diagnostic fact: `getOwnPropertyDescriptor`
  // reports a safe `42`, `get` would answer `Date` if ever read live. This
  // reproduces the exact defect a validate-then-encode split allows: a
  // schema check that snapshots once could pass while a separate,
  // unguarded `canonicalJson` walk of the *original* value re-reads the
  // live `Date` and silently renders it as `{}`.
  const descriptorSafeLiveDivergentFact = new Proxy([0], {
    getOwnPropertyDescriptor(target, prop) {
      if (prop === "0") return { value: 42, writable: true, enumerable: true, configurable: true };
      return Object.getOwnPropertyDescriptor(target, prop);
    },
    get(target, prop, receiver) {
      if (prop === "0") return new Date(0);
      return Reflect.get(target, prop, receiver);
    },
  });

  const observationWithHostileFact = {
    format: "semantic.kernel-run",
    version: 1,
    kernel: "semantic.kernel-calculus/0018/v1",
    observation: {
      tag: "runtime-rejected",
      diagnostic: {
        code: "interpreter.example",
        occurrence_path: "/program",
        message: "m",
        actual: descriptorSafeLiveDivergentFact,
      },
    },
  } as never;

  test("encodeCanonicalKernelRunObservation emits the snapshotted 42, never the live Date or {}", () => {
    const text = new TextDecoder().decode(
      encodeCanonicalKernelRunObservation(observationWithHostileFact),
    );
    expect(text).toContain('"actual":[42]');
    expect(text).not.toContain("{}");
  });

  test("canonicalKernelRunObservationJson emits the same snapshotted 42, never the live Date or {}", () => {
    const text = canonicalKernelRunObservationJson(observationWithHostileFact);
    expect(text).toContain('"actual":[42]');
    expect(text).not.toContain("{}");
  });

  test("the byte encoder and the string encoder agree exactly on the one snapshot", () => {
    const bytesText = new TextDecoder().decode(
      encodeCanonicalKernelRunObservation(observationWithHostileFact),
    );
    const jsonText = canonicalKernelRunObservationJson(observationWithHostileFact);
    expect(bytesText.trimEnd()).toBe(jsonText);
  });
});
