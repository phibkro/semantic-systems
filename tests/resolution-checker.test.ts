import { afterEach, describe, expect, test } from "bun:test";
import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { BunCrypto, BunFileSystem, BunPath } from "@effect/platform-bun";
import { Effect, type Crypto, type FileSystem, type Path } from "effect";
import { checkResolution } from "../src/tracer/checker.ts";
import type { CheckerReport } from "../src/tracer/checker-report.ts";
import { runDemo } from "../src/tracer/demo.ts";
import type { JsonObject, JsonValue } from "../src/tracer/json.ts";
import { producerOutcomeToJson } from "../src/tracer/packets.ts";

const ROOT = resolve(import.meta.dir, "..");
const INVENTORY = resolve(ROOT, "examples", "inventory");
const temporaryRoots: Array<string> = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((path) => rm(path, { recursive: true })));
});

const readJson = async (path: string): Promise<JsonObject> =>
  (await Bun.file(path).json()) as JsonObject;

const provideBun = <A, E>(
  effect: Effect.Effect<A, E, FileSystem.FileSystem | Path.Path | Crypto.Crypto>,
): Effect.Effect<A, E> =>
  effect.pipe(Effect.provide([BunCrypto.layer, BunFileSystem.layer, BunPath.layer]));

const runCrypto = <A, E>(effect: Effect.Effect<A, E, Crypto.Crypto>): Promise<A> =>
  Effect.runPromise(effect.pipe(Effect.provide(BunCrypto.layer)));

interface Positive {
  readonly theory: JsonObject;
  readonly realizations: ReadonlyArray<JsonObject>;
  readonly recipes: ReadonlyArray<JsonObject>;
  readonly policy: JsonObject;
  readonly outcomes: ReadonlyArray<JsonValue>;
  readonly claim: JsonObject;
}

const positive = async (): Promise<Positive> => {
  const result = await Effect.runPromise(provideBun(runDemo(INVENTORY)));
  return {
    theory: await readJson(resolve(INVENTORY, "contracts", "inventory-v0.json")),
    realizations: await Promise.all(
      ["broken.json", "pure.json"].map((name) =>
        readJson(resolve(INVENTORY, "realizations", name)),
      ),
    ),
    recipes: [await readJson(resolve(INVENTORY, "evidence", "conformance-v0.json"))],
    policy: await readJson(resolve(INVENTORY, "policies", "development.json")),
    outcomes: result.producerOutcomes.map(producerOutcomeToJson),
    claim: result.claim,
  };
};

const check = (
  input: Positive,
  outcomes: ReadonlyArray<JsonValue> = input.outcomes,
  claim: JsonObject = input.claim,
  policy: JsonObject = input.policy,
  recipes: ReadonlyArray<JsonObject> = input.recipes,
): Promise<CheckerReport> =>
  runCrypto(checkResolution(input.theory, input.realizations, recipes, policy, outcomes, claim));

const codes = (report: CheckerReport): ReadonlyArray<string> =>
  report.violations.map((violation) => violation.code);

const mutableObject = (value: JsonObject): Record<string, unknown> =>
  structuredClone(value) as Record<string, unknown>;

const mutableOutcomes = (value: ReadonlyArray<JsonValue>): Array<Record<string, unknown>> =>
  structuredClone(value) as Array<Record<string, unknown>>;

const selectedIdentity = (claim: JsonObject): string =>
  (claim.selected as Record<string, string>).identity;

describe("independent resolution checker", () => {
  test("accepts the positive claim and recomputes the selected identity", async () => {
    const input = await positive();
    const report = await check(input);
    expect(report.valid).toBeTrue();
    expect(report.recomputedStatus).toBe("selected");
    expect(report.recomputedSelected).toEqual({
      id: "realization.inventory.pure",
      identity: selectedIdentity(input.claim),
    });
  });

  test("visible verify-resolution command reports exact bindings before execution", () => {
    const result = Bun.spawnSync({
      cmd: ["bun", "run", "semantic-tracer", "--", "verify-resolution", "examples/inventory"],
      cwd: ROOT,
      stdout: "pipe",
      stderr: "pipe",
    });
    expect(result.exitCode).toBe(0);
    const output = result.stdout.toString();
    expect(output).toContain(
      "Policy: policy.inventory.development (sha256:5873935921a72d445df6b33579152e0c965a637d4e4927e35c4f7327beb1bf10)",
    );
    expect(output).toContain("Evidence result: sha256:");
    expect(output).toContain("Selected: realization.inventory.pure (sha256:");
    expect(output).toContain("Checker: valid (0 violations)");
    expect(output).toContain("Model binding: valid");
    expect(output.indexOf("Checker: valid")).toBeLessThan(output.indexOf("Result: oracle matched"));
  });

  test("executes only after both the independent checker and canonical binding pass", async () => {
    const accepted = await Effect.runPromise(provideBun(runDemo(INVENTORY)));
    expect(accepted.checkerReport.valid).toBeTrue();
    expect(accepted.checkerReport.modelBindingStatus).toBe("valid");
    expect(accepted.modelBindingReport?.valid).toBeTrue();
    expect(accepted.execution).not.toBeNull();

    const root = await mkdtemp(resolve(tmpdir(), "semantic-model-drift-"));
    temporaryRoots.push(root);
    const modelRoot = resolve(root, "model");
    await cp(resolve(ROOT, "model"), modelRoot, { recursive: true });
    const semanticPath = resolve(modelRoot, "semantic", "inventory-tracer.json");
    const semantic = mutableObject(await readJson(semanticPath));
    const theory = (semantic.entities as Array<Record<string, unknown>>).find(
      (item) => item.id === "theory.inventory",
    )!;
    (theory.attributes as Record<string, unknown>).identity = `sha256:${"0".repeat(64)}`;
    await Bun.write(semanticPath, `${JSON.stringify(semantic, null, 2)}\n`);

    const rejected = await Effect.runPromise(
      provideBun(runDemo(INVENTORY, "development", modelRoot)),
    );
    expect(rejected.checkerReport.valid).toBeTrue();
    expect(rejected.checkerReport.modelBindingStatus).toBe("invalid");
    expect(rejected.modelBindingReport?.violations.map((item) => item.code)).toContain(
      "theory_identity_drift",
    );
    expect(rejected.execution).toBeNull();

    (theory.attributes as Record<string, unknown>).identity = accepted.theory.identity;
    await Bun.write(semanticPath, `${JSON.stringify(semantic, null, 2)}\n`);
    const evidencePath = resolve(modelRoot, "evidence", "inventory-tracer.json");
    const evidence = mutableObject(await readJson(evidencePath));
    const pureEvidence = (evidence.entities as Array<Record<string, unknown>>).find(
      (item) => item.id === "evidence.inventory.pure-conformance-v0",
    )!;
    (pureEvidence.attributes as Record<string, unknown>).cases = "9/8";
    await Bun.write(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);

    const caseRejected = await Effect.runPromise(
      provideBun(runDemo(INVENTORY, "development", modelRoot)),
    );
    expect(caseRejected.modelBindingReport?.violations.map((item) => item.code)).toContain(
      "evidence_case_count_drift",
    );
    expect(caseRejected.execution).toBeNull();
  });

  test("rejects a recipe supplied as an evidence result", async () => {
    const input = await positive();
    const recipe = await readJson(resolve(INVENTORY, "evidence", "conformance-v0.json"));
    const report = await check(input, [...input.outcomes, recipe]);
    expect(report.valid).toBeFalse();
    expect(codes(report)).toContain("producer_outcome_malformed");
  });

  test("rejects evidence bound to a recipe no longer present in the authored set", async () => {
    const input = await positive();
    const changed = mutableObject(input.recipes[0]!);
    changed.name = "Mutated recipe";
    const report = await check(input, input.outcomes, input.claim, input.policy, [
      changed as JsonObject,
    ]);
    expect(report.valid).toBeFalse();
    expect(codes(report)).toContain("evidence_recipe_unbound");
  });

  test("rejects relabeled evidence and a stored aggregate inconsistent with cases", async () => {
    const input = await positive();
    const relabeled = mutableOutcomes(input.outcomes);
    relabeled[0]!.category = "proof";
    expect((await check(input, relabeled as ReadonlyArray<JsonValue>)).valid).toBeFalse();

    const aggregate = mutableOutcomes(input.outcomes);
    aggregate[0]!.passed = true;
    expect(codes(await check(input, aggregate as ReadonlyArray<JsonValue>))).toContain(
      "producer_outcome_field_mismatch",
    );
  });

  test("rejects a failing case changed to passed", async () => {
    const input = await positive();
    const outcomes = mutableOutcomes(input.outcomes);
    const broken = outcomes.find(
      (outcome) => outcome.realization_identity !== selectedIdentity(input.claim),
    )!;
    const cases = broken.case_results as Array<Record<string, unknown>>;
    cases.find((item) => item.passed === false)!.passed = true;
    expect((await check(input, outcomes as ReadonlyArray<JsonValue>)).valid).toBeFalse();
  });

  test("rejects a copied passing result rebound to the broken subject", async () => {
    const input = await positive();
    const outcomes = mutableOutcomes(input.outcomes);
    const pure = outcomes.find(
      (outcome) => outcome.realization_identity === selectedIdentity(input.claim),
    )!;
    const broken = outcomes.find(
      (outcome) => outcome.realization_identity !== selectedIdentity(input.claim),
    )!;
    const forged = structuredClone(pure);
    forged.realization_identity = broken.realization_identity;
    const brokenIndex = outcomes.indexOf(broken);
    outcomes[brokenIndex] = forged;
    const report = await check(input, outcomes as ReadonlyArray<JsonValue>);
    expect(report.valid).toBeFalse();
    expect(codes(report)).toContain("producer_outcome_field_mismatch");
  });

  for (const [name, mutate] of [
    [
      "eligible bit",
      (claim: Record<string, unknown>) => {
        const candidates = claim.candidates as Array<Record<string, unknown>>;
        candidates.find(
          (item) => item.realization_id === "realization.inventory.broken",
        )!.eligible = true;
      },
    ],
    [
      "reason set",
      (claim: Record<string, unknown>) => {
        const candidates = claim.candidates as Array<Record<string, unknown>>;
        candidates.find(
          (item) => item.realization_id === "realization.inventory.broken",
        )!.reason_codes = [];
      },
    ],
    [
      "selected identity",
      (claim: Record<string, unknown>) => {
        (claim.selected as Record<string, unknown>).identity = `sha256:${"0".repeat(64)}`;
      },
    ],
    [
      "selected value",
      (claim: Record<string, unknown>) => {
        claim.selected = null;
        claim.status = "rejected";
      },
    ],
    [
      "selected assumption",
      (claim: Record<string, unknown>) => {
        (claim.selected_assumptions as Array<string>).shift();
      },
    ],
  ] as const) {
    test(`rejects a mutated ${name}`, async () => {
      const input = await positive();
      const claim = mutableObject(input.claim);
      mutate(claim);
      expect((await check(input, input.outcomes, claim as JsonObject)).valid).toBeFalse();
    });
  }

  test("rejects omitted, duplicated, and unknown candidates", async () => {
    const input = await positive();
    for (const mutation of ["omitted", "duplicated", "unknown"] as const) {
      const claim = mutableObject(input.claim);
      const candidates = claim.candidates as Array<Record<string, unknown>>;
      if (mutation === "omitted") candidates.pop();
      if (mutation === "duplicated") candidates.push(structuredClone(candidates[0]!));
      if (mutation === "unknown") candidates[0]!.realization_id = "realization.unknown";
      const report = await check(input, input.outcomes, claim as JsonObject);
      expect(report.valid).toBeFalse();
      expect(codes(report)).toContain(
        mutation === "omitted"
          ? "candidate_missing"
          : mutation === "duplicated"
            ? "candidate_duplicate"
            : "candidate_unknown",
      );
    }
  });

  test("rejects a policy changed without recomputing the claim", async () => {
    const input = await positive();
    const policy = mutableObject(input.policy);
    const requirements = policy.requirements as Record<string, Record<string, unknown>>;
    requirements["obligation.inventory.conformance"]!.allow_assumptions = false;
    expect(
      (await check(input, input.outcomes, input.claim, policy as JsonObject)).valid,
    ).toBeFalse();
  });

  test("keeps resolver and checker outside each other's forbidden capabilities", async () => {
    const checker = await Bun.file(resolve(ROOT, "src", "tracer", "checker.ts")).text();
    const resolver = await Bun.file(resolve(ROOT, "src", "tracer", "resolver.ts")).text();
    for (const forbidden of [
      "./resolver.ts",
      "./demo.ts",
      "./evidence.ts",
      "./producer.ts",
      "./operations.ts",
      "./domain.ts",
      "./execution.ts",
    ]) {
      expect(checker).not.toContain(`from "${forbidden}"`);
    }
    for (const forbidden of [
      "./evidence.ts",
      "./producer.ts",
      "./operations.ts",
      "./domain.ts",
      "./execution.ts",
    ]) {
      expect(resolver).not.toContain(`from "${forbidden}"`);
    }
  });

  test("checker decision core stays at or below 70% of production adjudication", async () => {
    const count = async (name: string): Promise<number> => {
      const source = await Bun.file(resolve(ROOT, "src", "tracer", name)).text();
      let blockComment = false;
      return source.split("\n").filter((line) => {
        const trimmed = line.trim();
        if (blockComment) {
          if (trimmed.includes("*/")) blockComment = false;
          return false;
        }
        if (trimmed.startsWith("/*")) {
          blockComment = !trimmed.includes("*/");
          return false;
        }
        return trimmed !== "" && !trimmed.startsWith("//");
      }).length;
    };
    const checkerLines = await count("checker.ts");
    const resolverLines = await count("resolver.ts");
    expect(checkerLines / resolverLines).toBeLessThanOrEqual(0.7);
  });
});
