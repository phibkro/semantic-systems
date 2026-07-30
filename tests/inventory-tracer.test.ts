import { afterEach, describe, expect, test } from "bun:test";
import { cp, mkdtemp, rm, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { BunCrypto, BunFileSystem, BunPath } from "@effect/platform-bun";
import { NodeCrypto, NodeFileSystem, NodePath } from "@effect/platform-node";
import { Effect, Exit, type Crypto, type FileSystem, type Path } from "effect";
import { demoToJson, runDemo } from "../src/tracer/demo.ts";
import type { JsonObject } from "../src/tracer/json.ts";
import { normalizeTheory } from "../src/tracer/theory.ts";

const ROOT = resolve(import.meta.dir, "..");
const INVENTORY = join(ROOT, "examples", "inventory");
const temporaryRoots: Array<string> = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((path) => rm(path, { recursive: true })));
});

const readJson = async (path: string): Promise<JsonObject> =>
  (await Bun.file(path).json()) as JsonObject;

const writeJson = (path: string, document: unknown): Promise<number> =>
  Bun.write(path, `${JSON.stringify(document, null, 2)}\n`);

const copyInventory = async (): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), "semantic-inventory-"));
  temporaryRoots.push(root);
  const target = join(root, "inventory");
  await cp(INVENTORY, target, { recursive: true });
  return target;
};

const provideBun = <A, E>(
  effect: Effect.Effect<A, E, FileSystem.FileSystem | Path.Path | Crypto.Crypto>,
): Effect.Effect<A, E> =>
  effect.pipe(Effect.provide([BunCrypto.layer, BunFileSystem.layer, BunPath.layer]));

const provideNode = <A, E>(
  effect: Effect.Effect<A, E, FileSystem.FileSystem | Path.Path | Crypto.Crypto>,
): Effect.Effect<A, E> =>
  effect.pipe(Effect.provide([NodeCrypto.layer, NodeFileSystem.layer, NodePath.layer]));

const runBun = <A, E>(
  effect: Effect.Effect<A, E, FileSystem.FileSystem | Path.Path | Crypto.Crypto>,
): Promise<A> => Effect.runPromise(provideBun(effect));

const runJson = async (root = INVENTORY, policy = "development"): Promise<JsonObject> =>
  demoToJson(await runBun(runDemo(root, policy)));

const candidate = (document: JsonObject, id: string): JsonObject => {
  const resolution = document.resolution as JsonObject;
  return (resolution.candidates as ReadonlyArray<JsonObject>).find(
    (item) => item.realization_id === id,
  )!;
};

const entity = (document: JsonObject, id: string): JsonObject =>
  (document.entities as ReadonlyArray<JsonObject>).find((item) => item.id === id)!;

const expectFailure = async <A>(
  effect: Effect.Effect<A, unknown, FileSystem.FileSystem | Path.Path | Crypto.Crypto>,
  message: string,
) => {
  const exit = await Effect.runPromiseExit(provideBun(effect));
  expect(Exit.isFailure(exit)).toBeTrue();
  if (Exit.isFailure(exit)) expect(String(exit.cause)).toContain(message);
};

describe("inventory tracer Effect v4 slice", () => {
  test("normalization ignores formatting, order, and display metadata", async () => {
    const originalDocument = await readJson(join(INVENTORY, "contracts", "inventory-v0.json"));
    const reordered = structuredClone(originalDocument) as Record<string, unknown>;
    for (const key of ["types", "operations", "laws"]) {
      reordered[key] = [...(reordered[key] as ReadonlyArray<unknown>)].reverse();
    }
    const decorated = structuredClone(originalDocument) as Record<string, unknown>;
    (decorated.laws as Array<Record<string, unknown>>)[0]!.documentation = "Longer";
    (decorated.operations as Array<Record<string, unknown>>)[0]!.display_name = "Friendly";
    (decorated.types as Array<Record<string, unknown>>)[0]!.source_path = "elsewhere";

    const original = await runBun(normalizeTheory(originalDocument));
    expect(await runBun(normalizeTheory(reordered as JsonObject))).toEqual(original);
    expect((await runBun(normalizeTheory(decorated as JsonObject))).identity).toBe(
      original.identity,
    );
  });

  test("normalization changes on a law change and rejects duplicate IDs", async () => {
    const theory = await readJson(join(INVENTORY, "contracts", "inventory-v0.json"));
    const changed = structuredClone(theory) as Record<string, unknown>;
    const laws = changed.laws as Array<Record<string, unknown>>;
    laws[0]!.statement = `${laws[0]!.statement as string} except under load`;
    expect((await runBun(normalizeTheory(changed as JsonObject))).identity).not.toBe(
      (await runBun(normalizeTheory(theory))).identity,
    );

    laws.push(structuredClone(laws[0]!));
    await expectFailure(normalizeTheory(changed as JsonObject), "duplicate declaration IDs");
  });

  test("Bun and Node live layers produce the same tracer observation", async () => {
    const bun = demoToJson(await runBun(runDemo(INVENTORY)));
    const node = demoToJson(await Effect.runPromise(provideNode(runDemo(INVENTORY))));
    expect(node).toEqual(bun);
  });

  test("selects the reference and preserves exact accepted evidence identities", async () => {
    const document = await runJson();
    const resolution = document.resolution as JsonObject;
    expect(resolution.status).toBe("selected");
    expect(resolution.selected_realization).toBe("realization.inventory.pure");
    const pure = candidate(document, "realization.inventory.pure");
    const broken = candidate(document, "realization.inventory.broken");
    expect(pure.realization_identity).toBe(
      "sha256:67a6b723fa37eaaa7fffe0890f27174f2d04027e05f3eaf8760d9a430a7201b9",
    );
    expect(broken.realization_identity).toBe(
      "sha256:44bc84e17c9abaab229cc3a6fb143ebeb3a6a6655e014eec60c0d7fbe0c029c0",
    );
    expect(pure.eligible).toBeTrue();
    expect(broken.eligible).toBeFalse();
    expect(broken.reason_codes).toContain("conformance_failed");
    expect((broken.counterexamples as ReadonlyArray<unknown>).length).toBe(2);
    const evidence = pure.evidence as JsonObject;
    expect(evidence.category).toBe("example_test");
    expect(evidence.passed_cases).toBe(9);
    expect(evidence.total_cases).toBe(9);
    const execution = document.execution as JsonObject;
    expect(execution.matches_oracle).toBeTrue();
    expect(execution.final_state).toEqual({ stock: { apple: 5 }, reservations: {} });
  });

  test("missing evidence and proof-only policy reject without execution", async () => {
    const inventory = await copyInventory();
    await unlink(join(inventory, "evidence", "conformance-v0.json"));
    const missing = await runJson(inventory);
    expect((missing.resolution as JsonObject).status).toBe("rejected");
    for (const item of (missing.resolution as JsonObject).candidates as ReadonlyArray<JsonObject>) {
      expect(item.reason_codes).toContain("missing_evidence");
    }
    expect(missing.execution).toBeNull();

    const highAssurance = await runJson(INVENTORY, "high-assurance");
    expect((highAssurance.resolution as JsonObject).status).toBe("rejected");
    expect(candidate(highAssurance, "realization.inventory.pure").reason_codes).toContain(
      "evidence_category_not_accepted",
    );
  });

  test("multiple eligible realizations reject as ambiguous", async () => {
    const inventory = await copyInventory();
    const pure = (await readJson(join(inventory, "realizations", "pure.json"))) as Record<
      string,
      unknown
    >;
    pure.id = "realization.inventory.pure-copy";
    pure.name = "Second lawful pure realization";
    await writeJson(join(inventory, "realizations", "pure-copy.json"), pure);
    const document = await runJson(inventory);
    expect((document.resolution as JsonObject).reason_codes).toEqual(["ambiguous_candidates"]);
    expect(document.execution).toBeNull();
  });

  test("wrong-theory and unbound candidates are independently rejected", async () => {
    const inventory = await copyInventory();
    const purePath = join(inventory, "realizations", "pure.json");
    const pure = (await readJson(purePath)) as Record<string, unknown>;
    pure.theory = "theory.some-other-contract";
    await writeJson(purePath, pure);
    const wrongTheory = await runJson(inventory);
    expect(candidate(wrongTheory, "realization.inventory.pure").reason_codes).toEqual([
      "theory_mismatch",
    ]);

    const second = await copyInventory();
    const unbound = (await readJson(join(second, "realizations", "pure.json"))) as Record<
      string,
      unknown
    >;
    unbound.id = "realization.inventory.unbound";
    (unbound.operations as Record<string, unknown>).transition = "inventory.unavailable.v0";
    await writeJson(join(second, "realizations", "unbound.json"), unbound);
    const document = await runJson(second);
    expect((document.resolution as JsonObject).selected_realization).toBe(
      "realization.inventory.pure",
    );
    expect(candidate(document, "realization.inventory.unbound").reason_codes).toEqual([
      "unbound_operation",
    ]);
  });

  test("duplicate realization IDs fail before selection", async () => {
    const inventory = await copyInventory();
    const path = join(inventory, "realizations", "broken.json");
    const broken = (await readJson(path)) as Record<string, unknown>;
    broken.id = "realization.inventory.pure";
    await writeJson(path, broken);
    await expectFailure(runDemo(inventory), "duplicate IDs");
  });

  test("nested malformed documents fail at the Effect Schema boundary", async () => {
    const inventory = await copyInventory();
    const theoryPath = join(inventory, "contracts", "inventory-v0.json");
    const theory = (await readJson(theoryPath)) as Record<string, unknown>;
    theory.laws = {};
    await writeJson(theoryPath, theory);
    await expectFailure(runDemo(inventory), "invalid theory document");
    await expectFailure(runDemo(inventory), "laws");
  });

  for (const artifact of ["realization", "suite"] as const) {
    test(`malformed ${artifact} assumptions cannot bypass policy`, async () => {
      const inventory = await copyInventory();
      const policyPath = join(inventory, "policies", "development.json");
      const policy = (await readJson(policyPath)) as Record<string, unknown>;
      const requirement = (policy.requirements as Record<string, Record<string, unknown>>)[
        "obligation.inventory.conformance"
      ]!;
      requirement.accepted_categories = ["example_test"];
      requirement.allow_assumptions = false;
      await writeJson(policyPath, policy);
      const target =
        artifact === "realization"
          ? join(inventory, "realizations", "pure.json")
          : join(inventory, "evidence", "conformance-v0.json");
      const document = (await readJson(target)) as Record<string, unknown>;
      document.assumptions = [{ hidden: "assumption" }];
      await writeJson(target, document);
      await expectFailure(runDemo(inventory), "assumptions");
    });
  }

  test("example evidence cannot relabel itself as proof", async () => {
    const inventory = await copyInventory();
    const path = join(inventory, "evidence", "conformance-v0.json");
    const suite = (await readJson(path)) as Record<string, unknown>;
    suite.category = "proof";
    await writeJson(path, suite);
    await expectFailure(runDemo(inventory, "high-assurance"), "cannot relabel");
  });

  test("law drift, wrong obligation, and duplicate suites reject explicitly", async () => {
    const staleInventory = await copyInventory();
    const theoryPath = join(staleInventory, "contracts", "inventory-v0.json");
    const theory = (await readJson(theoryPath)) as Record<string, unknown>;
    const laws = theory.laws as Array<Record<string, unknown>>;
    laws[0]!.statement = `${laws[0]!.statement as string} except under load`;
    await writeJson(theoryPath, theory);
    const stale = await runJson(staleInventory);
    for (const item of (stale.resolution as JsonObject).candidates as ReadonlyArray<JsonObject>) {
      expect(item.reason_codes).toEqual(["stale_evidence_recipe"]);
    }

    const wrongInventory = await copyInventory();
    const suitePath = join(wrongInventory, "evidence", "conformance-v0.json");
    const suite = (await readJson(suitePath)) as Record<string, unknown>;
    suite.obligation = "obligation.inventory.unrelated";
    await writeJson(suitePath, suite);
    const wrong = await runJson(wrongInventory);
    for (const item of (wrong.resolution as JsonObject).candidates as ReadonlyArray<JsonObject>) {
      expect(item.reason_codes).toEqual(["evidence_obligation_mismatch"]);
    }

    const duplicateInventory = await copyInventory();
    const duplicate = await readJson(join(duplicateInventory, "evidence", "conformance-v0.json"));
    await writeJson(join(duplicateInventory, "evidence", "duplicate.json"), duplicate);
    const ambiguous = await runJson(duplicateInventory);
    for (const item of (ambiguous.resolution as JsonObject)
      .candidates as ReadonlyArray<JsonObject>) {
      expect(item.reason_codes).toEqual(["ambiguous_evidence"]);
    }
  });

  test("CLI reports selection and returns failure on oracle mismatch", async () => {
    const success = Bun.spawnSync({
      cmd: ["bun", "run", "semantic-tracer", "--", "demo", INVENTORY],
      cwd: ROOT,
      stdout: "pipe",
      stderr: "pipe",
    });
    expect(success.exitCode).toBe(0);
    const output = success.stdout.toString();
    expect(output).toContain("Theory: theory.inventory (sha256:");
    expect(output).toContain("Selected: realization.inventory.pure");
    expect(output).toContain("Evidence: example_test (9/9 cases passed)");
    expect(output).toContain('"change_options":');
    expect(output).toContain("Result: oracle matched");

    const inventory = await copyInventory();
    const path = join(inventory, "scenarios", "demo.json");
    const scenario = (await readJson(path)) as Record<string, unknown>;
    (
      (scenario.expected_final_state as Record<string, unknown>).stock as Record<string, unknown>
    ).apple = 999;
    await writeJson(path, scenario);
    const failure = Bun.spawnSync({
      cmd: ["bun", "run", "semantic-tracer", "--", "demo", inventory],
      cwd: ROOT,
      stdout: "pipe",
      stderr: "pipe",
    });
    expect(failure.exitCode).toBe(1);
    expect(failure.stdout.toString()).toContain("Result: oracle mismatch");
  });

  test("canonical graph bindings match the executable TypeScript result", async () => {
    const result = await runJson();
    const theoryIdentity = (result.theory as JsonObject).identity;
    const pure = candidate(result, "realization.inventory.pure");
    const broken = candidate(result, "realization.inventory.broken");
    const semantic = await readJson(join(ROOT, "model", "semantic", "inventory-tracer.json"));
    const components = await readJson(join(ROOT, "model", "architecture", "components.json"));
    const architecture = await readJson(
      join(ROOT, "model", "architecture", "inventory-tracer.json"),
    );
    const evidence = await readJson(join(ROOT, "model", "evidence", "inventory-tracer.json"));
    const execution = await readJson(join(ROOT, "model", "execution", "inventory-tracer.json"));
    const recipe = await readJson(join(INVENTORY, "evidence", "conformance-v0.json"));

    expect(entity(semantic, "theory.inventory").attributes).toMatchObject({
      identity: theoryIdentity,
    });
    expect(recipe.theory_identity).toBe(theoryIdentity);
    expect(entity(evidence, "artifact.inventory.conformance-recipe-v0").attributes).toMatchObject({
      identity: "sha256:92335ebf5242f2c74c0b14fb1dae7c0588eb0795768954730560d9d713ce3524",
      theory_identity: theoryIdentity,
    });
    expect(entity(components, "realization.inventory.pure").attributes).toMatchObject({
      identity: pure.realization_identity,
      execution_adapter: "typescript-builtins-v0",
    });
    expect(entity(architecture, "realization.inventory.broken").attributes).toMatchObject({
      identity: broken.realization_identity,
    });
    expect(entity(evidence, "evidence.inventory.pure-conformance-v0").attributes).toMatchObject({
      identity: (pure.evidence as JsonObject).identity,
      recipe_identity: (pure.evidence as JsonObject).recipe_identity,
      theory_identity: theoryIdentity,
      realization_identity: pure.realization_identity,
      cases: "9/9",
    });
    expect(entity(evidence, "evidence.inventory.broken-conformance-v0").attributes).toMatchObject({
      identity: (broken.evidence as JsonObject).identity,
      recipe_identity: (broken.evidence as JsonObject).recipe_identity,
      theory_identity: theoryIdentity,
      realization_identity: broken.realization_identity,
      cases: "7/9",
    });
    expect(entity(execution, "artifact.lock.inventory.reference").attributes).toMatchObject({
      theory_identity: theoryIdentity,
      realization_identity: pure.realization_identity,
      policy_id: "policy.inventory.development",
      policy_identity: ((result.claim as JsonObject).policy as JsonObject).content_identity,
      recipe_identity: (pure.evidence as JsonObject).recipe_identity,
      evidence_result_identity: (pure.evidence as JsonObject).identity,
    });
  });
});
