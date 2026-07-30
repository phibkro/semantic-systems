import { afterEach, describe, expect, test } from "bun:test";
import { cp, mkdtemp, rm, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { BunCrypto, BunFileSystem, BunPath } from "@effect/platform-bun";
import { NodeCrypto, NodeFileSystem, NodePath } from "@effect/platform-node";
import { Effect, Exit, type Crypto, type FileSystem, type Path } from "effect";
import * as tsAst from "typescript/unstable/ast";
import { demoToJson, runDemo } from "../src/tracer/demo.ts";
import { produceEvidence, type EvidenceAdapters } from "../src/tracer/evidence.ts";
import {
  ARTIFACT_KIND_EVIDENCE_RESULT,
  EVIDENCE_RESULT_SCHEMA_VERSION,
  caseResultToJson,
  evidenceResultIdentityPayload,
  evidenceToJson,
  parseEvidenceResult,
  producerDiagnosticToJson,
  type EvidenceResult,
  type ProducerDiagnostic,
  type ProducerOutcome,
} from "../src/tracer/evidence-result.ts";
import { contentIdentity } from "../src/tracer/canonical.ts";
import { DocumentError, type JsonObject } from "../src/tracer/json.ts";
import { loadInventory } from "../src/tracer/loader.ts";
import { resolveReplay, resolveTransition } from "../src/tracer/operations.ts";
import { normalizeRealization, realizationId } from "../src/tracer/realization.ts";
import {
  candidateExplanation,
  candidateToJson,
  requiredObligation,
  resolve as resolveDeployment,
} from "../src/tracer/resolver.ts";
import { normalizeTheory } from "../src/tracer/theory.ts";

const ROOT = resolve(import.meta.dir, "..");
const INVENTORY = join(ROOT, "examples", "inventory");
const temporaryRoots: Array<string> = [];

/**
 * Import-closure test oracle (design spec 0003 review): a source regex is
 * not a reliable authority for "does this file import that module" — it
 * cannot distinguish a string/comment/template that merely contains the
 * text "from" or "import(" from a real import, and it misses side-effect
 * imports, dynamic imports, and import-equals. This reuses the installed
 * TypeScript scanner (the real lexer, not a regex) to tokenize source, then
 * pattern-matches the resulting token stream for every import/export-from
 * form. `tokenizeBounded` caps total tokens at `source.length + 1` and
 * throws if end-of-file is not reached within that bound, so a pathological
 * or truncated input fails closed instead of looping or under-reporting.
 */
const SK = tsAst.SyntaxKind;

interface ScannedToken {
  readonly kind: number;
  readonly text: string;
}

const tokenizeBounded = (source: string): ReadonlyArray<ScannedToken> => {
  const scanner = tsAst.createScanner(true, tsAst.LanguageVariant.Standard, source);
  const tokens: Array<ScannedToken> = [];
  const cap = source.length + 1;
  for (let i = 0; i <= cap; i++) {
    const kind = scanner.scan();
    if (kind === SK.EndOfFile) return tokens;
    tokens.push({
      kind,
      text: kind === SK.StringLiteral ? scanner.getTokenValue() : scanner.getTokenText(),
    });
  }
  throw new Error(`tokenizer did not reach end of file within ${cap} tokens; refusing to continue`);
};

interface ImportScanResult {
  readonly relativeSpecifiers: ReadonlyArray<string>;
  readonly bareSpecifiers: ReadonlyArray<string>;
}

/**
 * Recognizes, over the real token stream (never raw source text):
 * - side-effect imports: `import "./x.ts"`;
 * - dynamic imports with a literal specifier: `import("./x.ts")`;
 * - static/type/namespace/default/named imports and re-exports, by
 *   scanning forward from `import`/`export` for a `from STRING` pair
 *   (this single pattern covers `import { a } from`, `import type { a }
 *   from`, `import * as a from`, `export * from`, `export { a } from`,
 *   `export type { a } from`, and `export * as a from`, since none of
 *   those clause shapes affect where the trailing `from STRING` lands);
 * - import-equals / external module reference: `import x = require("./x.ts")`.
 * The forward scan for the `from`/`require` forms is bounded to the
 * current statement: it stops at a semicolon or the next `import`/`export`
 * keyword without a match, so it can never run past its own declaration
 * into unrelated code (no-semicolon/ASI declarations are unaffected, since
 * the match is found before any boundary token is reached).
 */
const scanImportSpecifiers = (source: string): ImportScanResult => {
  const tokens = tokenizeBounded(source);
  const relative: Array<string> = [];
  const bare: Array<string> = [];
  const record = (specifier: string): void => {
    if (specifier.startsWith("./") || specifier.startsWith("../")) relative.push(specifier);
    else bare.push(specifier);
  };
  const isStatementBoundary = (kind: number): boolean =>
    kind === SK.SemicolonToken || kind === SK.ImportKeyword || kind === SK.ExportKeyword;

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!;
    if (token.kind !== SK.ImportKeyword && token.kind !== SK.ExportKeyword) continue;

    if (token.kind === SK.ImportKeyword && tokens[i + 1]?.kind === SK.StringLiteral) {
      record(tokens[i + 1]!.text); // import "./x.ts";
      continue;
    }
    if (
      token.kind === SK.ImportKeyword &&
      tokens[i + 1]?.kind === SK.OpenParenToken &&
      tokens[i + 2]?.kind === SK.StringLiteral
    ) {
      record(tokens[i + 2]!.text); // import("./x.ts")
      continue;
    }

    for (let j = i + 1; j < tokens.length; j++) {
      const candidate = tokens[j]!;
      if (candidate.kind === SK.FromKeyword && tokens[j + 1]?.kind === SK.StringLiteral) {
        record(tokens[j + 1]!.text); // ... from "./x.ts"
        break;
      }
      if (
        token.kind === SK.ImportKeyword &&
        candidate.text === "=" &&
        tokens[j + 1]?.text === "require" &&
        tokens[j + 2]?.kind === SK.OpenParenToken &&
        tokens[j + 3]?.kind === SK.StringLiteral
      ) {
        record(tokens[j + 3]!.text); // import x = require("./x.ts")
        break;
      }
      if (isStatementBoundary(candidate.kind)) break;
    }
  }

  return { relativeSpecifiers: relative, bareSpecifiers: bare };
};

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
      theory_identity: theoryIdentity,
      realization_identity: pure.realization_identity,
      cases: "9/9",
    });
    expect(entity(evidence, "evidence.inventory.broken-conformance-v0").attributes).toMatchObject({
      theory_identity: theoryIdentity,
      realization_identity: broken.realization_identity,
      cases: "7/9",
    });
    expect(entity(execution, "artifact.lock.inventory.reference").attributes).toMatchObject({
      theory_identity: theoryIdentity,
      realization_identity: pure.realization_identity,
    });
  });
});

// Contract slices 2-3 (design spec 0003): conformance execution moved before
// resolution, and the resolver now consumes already-produced evidence
// packets plus typed producer diagnostics instead of executing recipes
// itself.
describe("evidence-production boundary and resolver packet consumption", () => {
  const THEORY_ID = "theory.inventory";

  const loadPureRealization = async () => {
    const fixture = await runBun(loadInventory(INVENTORY, "development"));
    const theory = await runBun(normalizeTheory(fixture.theory));
    const document = fixture.realizations.find(
      (candidate) => candidate.id === "realization.inventory.pure",
    )!;
    const realization = await runBun(normalizeRealization(document, theory, THEORY_ID));
    return { fixture, theory, realization };
  };

  const loadPureAndBroken = async () => {
    const fixture = await runBun(loadInventory(INVENTORY, "development"));
    const theory = await runBun(normalizeTheory(fixture.theory));
    const pureDocument = fixture.realizations.find(
      (candidate) => candidate.id === "realization.inventory.pure",
    )!;
    const brokenDocument = fixture.realizations.find(
      (candidate) => candidate.id === "realization.inventory.broken",
    )!;
    const pure = await runBun(normalizeRealization(pureDocument, theory, THEORY_ID));
    const broken = await runBun(normalizeRealization(brokenDocument, theory, THEORY_ID));
    return { fixture, theory, pure, broken };
  };

  const spyEvidenceAdapters = (): { adapters: EvidenceAdapters; calls: Array<string> } => {
    const calls: Array<string> = [];
    return {
      calls,
      adapters: {
        resolveTransition: (key) => {
          calls.push(`transition:${key}`);
          return resolveTransition(key);
        },
        resolveReplay: (key) => {
          calls.push(`replay:${key}`);
          return resolveReplay(key);
        },
      },
    };
  };

  /**
   * Statically walks the transitive closure of relative (`./`, `../`)
   * imports reachable from `entryPath`, recording every visited file's
   * source and every non-relative (bare/`node:`) import specifier
   * encountered anywhere in the closure. This is deliberately a source-text
   * walk, not a bundler resolution or a runtime module graph: it exists to
   * catch an INDIRECT reintroduction (resolver.ts imports a module that
   * later grows an import into evidence.ts/domain.ts/etc.), which a
   * substring check against resolver.ts's own text alone cannot see. The
   * specifier extraction itself is `scanImportSpecifiers` (module scope
   * above), driven by the real TypeScript scanner rather than a regex.
   */
  const transitiveRelativeImportClosure = async (
    entryPath: string,
  ): Promise<{
    readonly files: ReadonlySet<string>;
    readonly bareImports: ReadonlySet<string>;
    readonly sources: ReadonlyMap<string, string>;
  }> => {
    const files = new Set<string>();
    const bareImports = new Set<string>();
    const sources = new Map<string, string>();
    const queue: Array<string> = [entryPath];
    while (queue.length > 0) {
      const path = queue.shift()!;
      if (files.has(path)) continue;
      files.add(path);
      const source = await Bun.file(path).text();
      sources.set(path, source);
      const { relativeSpecifiers, bareSpecifiers } = scanImportSpecifiers(source);
      for (const specifier of relativeSpecifiers) queue.push(resolve(dirname(path), specifier));
      for (const specifier of bareSpecifiers) bareImports.add(specifier);
    }
    return { files, bareImports, sources };
  };

  test("lossless case details survive evidenceToJson", async () => {
    const withoutIdentity: Omit<EvidenceResult, "identity"> = {
      artifactKind: ARTIFACT_KIND_EVIDENCE_RESULT,
      schemaVersion: EVIDENCE_RESULT_SCHEMA_VERSION,
      category: "example_test",
      producer: { id: "producer.test", version: "0" },
      recipeIdentity: "sha256:fixture-recipe",
      theoryIdentity: "sha256:fixture-theory",
      realizationIdentity: "sha256:fixture-realization",
      obligation: "obligation.inventory.conformance",
      assumptions: [],
      caseResults: [
        { caseId: "case-pass", passed: true, detail: null },
        {
          caseId: "case-fail",
          passed: false,
          detail: {
            expected_events: [{ kind: "Reserved" }],
            actual_events: [{ kind: "ReservationRejected", reason: "insufficient_stock" }],
          },
        },
      ],
    };
    const identity = await runBun(contentIdentity(evidenceResultIdentityPayload(withoutIdentity)));
    const evidence: EvidenceResult = { identity, ...withoutIdentity };
    const json = evidenceToJson(evidence);
    expect(json.artifact_kind).toBe("evidence_result");
    expect(json.schema_version).toBe(1);
    expect(json.identity).toBe(identity);
    expect(json.recipe_identity).toBe("sha256:fixture-recipe");
    expect(json.case_results).toEqual(evidence.caseResults.map(caseResultToJson));
    expect(json.case_results).toEqual([
      { case_id: "case-pass", passed: true, detail: null },
      {
        case_id: "case-fail",
        passed: false,
        detail: {
          expected_events: [{ kind: "Reserved" }],
          actual_events: [{ kind: "ReservationRejected", reason: "insufficient_stock" }],
        },
      },
    ]);
    expect(json.total_cases).toBe(2);
    expect(json.passed_cases).toBe(1);
    expect(json.passed).toBeFalse();
    expect(json.counterexamples).toEqual([
      {
        case_id: "case-fail",
        passed: false,
        detail: {
          expected_events: [{ kind: "Reserved" }],
          actual_events: [{ kind: "ReservationRejected", reason: "insufficient_stock" }],
        },
      },
    ]);

    // Round-trips losslessly through parseEvidenceResult: the recomputed
    // identity and every derived aggregate agree with what was serialized.
    const parsed = await runBun(parseEvidenceResult(json));
    expect(parsed).toEqual(evidence);
  });

  test("resolver eligibility works from an injected precomputed result without executing a realization", async () => {
    const { fixture, theory, realization } = await loadPureRealization();
    const injectedFields: Omit<EvidenceResult, "identity"> = {
      artifactKind: ARTIFACT_KIND_EVIDENCE_RESULT,
      schemaVersion: EVIDENCE_RESULT_SCHEMA_VERSION,
      category: "example_test",
      producer: { id: "producer.injected", version: "0" },
      recipeIdentity: "sha256:fixture-injected-recipe",
      theoryIdentity: theory.identity,
      realizationIdentity: realization.identity,
      obligation: "obligation.inventory.conformance",
      assumptions: [],
      caseResults: [{ caseId: "injected-case", passed: true, detail: null }],
    };
    const injectedIdentity = await runBun(
      contentIdentity(evidenceResultIdentityPayload(injectedFields)),
    );
    const injected: EvidenceResult = { identity: injectedIdentity, ...injectedFields };
    const outcome: ProducerOutcome = {
      ok: true,
      realizationId: realizationId(realization),
      realizationIdentity: realization.identity,
      result: injected,
    };
    const resolution = resolveDeployment(theory, [realization], [outcome], fixture.policy);
    expect(resolution.status).toBe("selected");
    const candidate = resolution.candidates[0]!;
    expect(candidate.eligible).toBeTrue();
    expect(candidate.evidence).toEqual(injected);
    expect(candidate.producerDiagnostic).toBeNull();
  });

  test("an injected producer diagnostic remains visible and blocks that candidate", async () => {
    const { fixture, theory, realization } = await loadPureRealization();
    const diagnostic: ProducerDiagnostic = {
      kind: "unbound_operation",
      message: "unbound transition operation 'inventory.unavailable.v0'",
    };
    const outcome: ProducerOutcome = {
      ok: false,
      realizationId: realizationId(realization),
      realizationIdentity: realization.identity,
      diagnostic,
    };
    const resolution = resolveDeployment(theory, [realization], [outcome], fixture.policy);
    expect(resolution.status).toBe("rejected");
    const candidate = resolution.candidates[0]!;
    expect(candidate.eligible).toBeFalse();
    expect(candidate.reasonCodes).toEqual(["unbound_operation"]);
    expect(candidate.evidence).toBeNull();
    expect(candidate.producerDiagnostic).toEqual(diagnostic);

    const json = candidateToJson(candidate);
    expect(json.evidence).toBeNull();
    expect(json.producer_diagnostic).toEqual(producerDiagnosticToJson(diagnostic));

    const explanation = candidateExplanation(candidate);
    expect(
      explanation.children.some((child) => child.rule === "produce_conformance_evidence"),
    ).toBeTrue();
  });

  test("a not_targeted producer diagnostic stays visible on a theory-mismatch candidate", async () => {
    const { fixture, theory, pure } = await loadPureAndBroken();
    const obligation = requiredObligation(theory);
    const adapters: EvidenceAdapters = { resolveTransition, resolveReplay };
    const wrongTheoryDocument: JsonObject = {
      ...pure.document,
      theory: "theory.some-other-contract",
    };
    const wrongTheoryRealization = await runBun(
      normalizeRealization(wrongTheoryDocument, theory, THEORY_ID),
    );
    // produceEvidence independently computes its own not_targeted
    // diagnostic for this exact realization; the resolver still derives
    // theory_mismatch itself, but must not drop that diagnostic.
    const outcome = await runBun(produceEvidence(
      theory,
      THEORY_ID,
      obligation,
      wrongTheoryRealization,
      fixture.evidenceSuites,
      adapters,
    ));
    if (outcome.ok) throw new Error("expected a not_targeted diagnostic");
    expect(outcome.diagnostic.kind).toBe("not_targeted");

    const resolution = resolveDeployment(theory, [wrongTheoryRealization], [outcome], fixture.policy);
    const candidate = resolution.candidates[0]!;
    expect(candidate.reasonCodes).toEqual(["theory_mismatch"]);
    expect(candidate.producerDiagnostic).toEqual(outcome.diagnostic);
    expect(candidateToJson(candidate).producer_diagnostic).toEqual(
      producerDiagnosticToJson(outcome.diagnostic),
    );
  });

  test("an obligation_unsupported producer diagnostic stays visible on an obligation-unsupported candidate", async () => {
    const rawTheory = await readJson(join(INVENTORY, "contracts", "inventory-v0.json"));
    const brokenObligationTheory = structuredClone(rawTheory) as Record<string, unknown>;
    const obligations = brokenObligationTheory.obligations as Array<Record<string, unknown>>;
    obligations.push({ ...obligations[0]!, id: "obligation.inventory.second" });
    const theory = await runBun(normalizeTheory(brokenObligationTheory as JsonObject));
    expect(requiredObligation(theory)).toBeNull();

    const fixture = await runBun(loadInventory(INVENTORY, "development"));
    const pureDocument = fixture.realizations.find(
      (candidate) => candidate.id === "realization.inventory.pure",
    )!;
    const pure = await runBun(normalizeRealization(pureDocument, theory, THEORY_ID));
    const adapters: EvidenceAdapters = { resolveTransition, resolveReplay };
    const outcome = await runBun(produceEvidence(theory, THEORY_ID, null, pure, fixture.evidenceSuites, adapters));
    if (outcome.ok) throw new Error("expected an obligation_unsupported diagnostic");
    expect(outcome.diagnostic.kind).toBe("obligation_unsupported");

    const resolution = resolveDeployment(theory, [pure], [outcome], fixture.policy);
    const candidate = resolution.candidates[0]!;
    expect(candidate.reasonCodes).toEqual(["required_obligation_set_unsupported"]);
    expect(candidate.producerDiagnostic).toEqual(outcome.diagnostic);
  });

  test("resolver rejects duplicate authored realization IDs before binding outcomes", async () => {
    const { fixture, theory, pure } = await loadPureAndBroken();
    const obligation = requiredObligation(theory);
    const adapters: EvidenceAdapters = { resolveTransition, resolveReplay };
    const pureOutcome = await runBun(produceEvidence(
      theory,
      THEORY_ID,
      obligation,
      pure,
      fixture.evidenceSuites,
      adapters,
    ));
    expect(() =>
      resolveDeployment(theory, [pure, pure], [pureOutcome], fixture.policy),
    ).toThrow("duplicate authored realization ID");
  });

  test("resolver rejects two differently-identitied realizations sharing one authored ID", async () => {
    const { fixture, theory, pure } = await loadPureAndBroken();
    const variantDocument: JsonObject = {
      ...pure.document,
      platform_requirements: [
        ...(pure.document.platform_requirements as ReadonlyArray<string>),
        "extra",
      ],
    };
    const variant = await runBun(normalizeRealization(variantDocument, theory, THEORY_ID));
    expect(variant.identity).not.toBe(pure.identity);
    expect(realizationId(variant)).toBe(realizationId(pure));
    const obligation = requiredObligation(theory);
    const adapters: EvidenceAdapters = { resolveTransition, resolveReplay };
    const pureOutcome = await runBun(produceEvidence(
      theory,
      THEORY_ID,
      obligation,
      pure,
      fixture.evidenceSuites,
      adapters,
    ));
    // A naive Set/Map binding by ID alone would collapse `pure` and
    // `variant` into one entry and could still resolve to a selection
    // without ever surfacing that two distinct, differently-identitied
    // realizations claimed the same authored ID (the review probe).
    expect(() =>
      resolveDeployment(theory, [pure, variant], [pureOutcome], fixture.policy),
    ).toThrow("duplicate authored realization ID");
  });

  test("resolver binds outcomes by realization identity, not array order", async () => {
    const { fixture, theory, pure, broken } = await loadPureAndBroken();
    const obligation = requiredObligation(theory);
    const adapters: EvidenceAdapters = { resolveTransition, resolveReplay };
    const pureOutcome = await runBun(produceEvidence(
      theory,
      THEORY_ID,
      obligation,
      pure,
      fixture.evidenceSuites,
      adapters,
    ));
    const brokenOutcome = await runBun(produceEvidence(
      theory,
      THEORY_ID,
      obligation,
      broken,
      fixture.evidenceSuites,
      adapters,
    ));
    // Realizations and outcomes are each passed in reversed, mismatched
    // order; correct binding must come from identity, not position.
    const resolution = resolveDeployment(
      theory,
      [broken, pure],
      [pureOutcome, brokenOutcome],
      fixture.policy,
    );
    expect(resolution.status).toBe("selected");
    expect(resolution.selectedRealization).toBe("realization.inventory.pure");
    const pureCandidate = resolution.candidates.find((item) => item.realization === pure)!;
    const brokenCandidate = resolution.candidates.find((item) => item.realization === broken)!;
    expect(pureCandidate.eligible).toBeTrue();
    expect(brokenCandidate.eligible).toBeFalse();
    expect(brokenCandidate.reasonCodes).toContain("conformance_failed");
  });

  test("a copied result with a stale inner subject binding is rejected deterministically", async () => {
    const { fixture, theory, pure, broken } = await loadPureAndBroken();
    const obligation = requiredObligation(theory);
    const adapters: EvidenceAdapters = { resolveTransition, resolveReplay };
    const pureOutcome = await runBun(produceEvidence(
      theory,
      THEORY_ID,
      obligation,
      pure,
      fixture.evidenceSuites,
      adapters,
    ));
    if (!pureOutcome.ok) throw new Error("expected the pure realization to produce evidence");
    // The pure realization's passing evidence is copied and rebound to the
    // broken realization's declared ID and wrapper identity, retaining its
    // passing case payload. The wrapper claims to match broken, but the
    // embedded evidence artifact's own realizationIdentity field is still
    // stale (it still says pure), so the inner cross-check must catch it
    // even though the outer wrapper looks consistent. This narrowly covers
    // a STALE inner subject; it says nothing about a fully re-stamped
    // forgery — see the separate DEFERRED test below for that gap.
    const reboundOutcome: ProducerOutcome = {
      ok: true,
      realizationId: realizationId(broken),
      realizationIdentity: broken.identity,
      result: pureOutcome.result,
    };
    expect(() =>
      resolveDeployment(theory, [pure, broken], [pureOutcome, reboundOutcome], fixture.policy),
    ).toThrow("evidence result for realization 'realization.inventory.broken' carries a mismatched realization identity");
  });

  test("DEFERRED: a fully refreshed rebind of passing cases onto the broken realization is not caught by this partial slice", async () => {
    const { fixture, theory, pure, broken } = await loadPureAndBroken();
    const obligation = requiredObligation(theory);
    const adapters: EvidenceAdapters = { resolveTransition, resolveReplay };
    const pureOutcome = await runBun(produceEvidence(
      theory,
      THEORY_ID,
      obligation,
      pure,
      fixture.evidenceSuites,
      adapters,
    ));
    if (!pureOutcome.ok) throw new Error("expected the pure realization to produce evidence");
    // Unlike the stale-inner-subject case above, every identity field here
    // is correctly refreshed to declare `broken` as the subject — only the
    // case-result payload is actually pure's passing run. This partial
    // slice compares declared identity strings; it does not re-execute
    // conformance or independently re-derive evidence content, so a
    // self-consistent forgery like this is NOT rejected here. Closing this
    // gap is explicitly deferred to the independent checker and canonical
    // project-model binding adapter (design spec 0003 slices 5-7). This
    // test documents the known boundary — it is NOT a contract acceptance,
    // and this outcome must not be read as "the rebind defense works." The
    // overall `identity` is itself recomputed from the rebound fields (not
    // copied stale from `pureOutcome.result`), so this is a genuinely
    // fully-refreshed forgery — the hash is internally self-consistent with
    // the rebound subject, and only the underlying case-result content is
    // still the wrong (pure) execution.
    const forgedFields = {
      ...pureOutcome.result,
      realizationIdentity: broken.identity,
      theoryIdentity: theory.identity,
    };
    const forgedIdentity = await runBun(
      contentIdentity(evidenceResultIdentityPayload(forgedFields)),
    );
    const forgedResult: EvidenceResult = { ...forgedFields, identity: forgedIdentity };
    const forgedOutcome: ProducerOutcome = {
      ok: true,
      realizationId: realizationId(broken),
      realizationIdentity: broken.identity,
      result: forgedResult,
    };
    const resolution = resolveDeployment(theory, [broken], [forgedOutcome], fixture.policy);
    expect(resolution.status).toBe("selected");
    expect(resolution.selectedRealization).toBe("realization.inventory.broken");
  });

  test("a diagnostic rebound to a mismatched realization identity is rejected deterministically", async () => {
    const { fixture, theory, pure, broken } = await loadPureAndBroken();
    const obligation = requiredObligation(theory);
    const adapters: EvidenceAdapters = { resolveTransition, resolveReplay };
    const pureOutcome = await runBun(produceEvidence(
      theory,
      THEORY_ID,
      obligation,
      pure,
      fixture.evidenceSuites,
      adapters,
    ));
    const diagnostic: ProducerDiagnostic = {
      kind: "unbound_operation",
      message: "unbound transition operation 'inventory.unavailable.v0'",
    };
    // Bound (by declared ID) to `broken`, so realization coverage is
    // otherwise complete, but its declared content identity claims `pure`
    // instead — an internally inconsistent diagnostic binding.
    const misboundDiagnostic: ProducerOutcome = {
      ok: false,
      realizationId: realizationId(broken),
      realizationIdentity: pure.identity,
      diagnostic,
    };
    expect(() =>
      resolveDeployment(
        theory,
        [pure, broken],
        [pureOutcome, misboundDiagnostic],
        fixture.policy,
      ),
    ).toThrow("mismatched realization identity");
  });

  test("a successful result bound to a mismatched theory identity is rejected deterministically", async () => {
    const { fixture, theory, pure } = await loadPureAndBroken();
    const obligation = requiredObligation(theory);
    const adapters: EvidenceAdapters = { resolveTransition, resolveReplay };
    const pureOutcome = await runBun(produceEvidence(
      theory,
      THEORY_ID,
      obligation,
      pure,
      fixture.evidenceSuites,
      adapters,
    ));
    if (!pureOutcome.ok) throw new Error("expected the pure realization to produce evidence");
    // Recompute the overall identity from the rebound `theoryIdentity` so
    // this isolates the resolver's theory-binding check specifically: the
    // failure below must come from `bindOutcomes`'s explicit theory-identity
    // comparison, not from an incidentally stale `identity` hash.
    const wrongTheoryFields = { ...pureOutcome.result, theoryIdentity: "sha256:some-other-theory" };
    const wrongTheoryIdentity = await runBun(
      contentIdentity(evidenceResultIdentityPayload(wrongTheoryFields)),
    );
    const wrongTheoryOutcome: ProducerOutcome = {
      ...pureOutcome,
      result: { ...wrongTheoryFields, identity: wrongTheoryIdentity },
    };
    expect(() =>
      resolveDeployment(theory, [pure], [wrongTheoryOutcome], fixture.policy),
    ).toThrow("mismatched theory identity");
  });

  test("resolver rejects a missing evidence-production outcome instead of defaulting", async () => {
    const { fixture, theory, pure, broken } = await loadPureAndBroken();
    const obligation = requiredObligation(theory);
    const adapters: EvidenceAdapters = { resolveTransition, resolveReplay };
    const pureOutcome = await runBun(produceEvidence(
      theory,
      THEORY_ID,
      obligation,
      pure,
      fixture.evidenceSuites,
      adapters,
    ));
    expect(() =>
      resolveDeployment(theory, [pure, broken], [pureOutcome], fixture.policy),
    ).toThrow("missing evidence-production outcome");
  });

  test("resolver rejects two outcomes bound to the same realization identity", async () => {
    const { fixture, theory, pure } = await loadPureAndBroken();
    const obligation = requiredObligation(theory);
    const adapters: EvidenceAdapters = { resolveTransition, resolveReplay };
    const pureOutcome = await runBun(produceEvidence(
      theory,
      THEORY_ID,
      obligation,
      pure,
      fixture.evidenceSuites,
      adapters,
    ));
    expect(() =>
      resolveDeployment(theory, [pure], [pureOutcome, pureOutcome], fixture.policy),
    ).toThrow("duplicate evidence-production outcome");
  });

  test("resolver rejects an outcome bound to a realization outside the current set", async () => {
    const { fixture, theory, pure, broken } = await loadPureAndBroken();
    const obligation = requiredObligation(theory);
    const adapters: EvidenceAdapters = { resolveTransition, resolveReplay };
    const pureOutcome = await runBun(produceEvidence(
      theory,
      THEORY_ID,
      obligation,
      pure,
      fixture.evidenceSuites,
      adapters,
    ));
    const brokenOutcome = await runBun(produceEvidence(
      theory,
      THEORY_ID,
      obligation,
      broken,
      fixture.evidenceSuites,
      adapters,
    ));
    expect(() =>
      resolveDeployment(theory, [pure], [pureOutcome, brokenOutcome], fixture.policy),
    ).toThrow("unknown realization");
  });

  test("invalid preflights never resolve execution adapters or run conformance", async () => {
    const { fixture, theory, pure } = await loadPureAndBroken();
    const obligation = requiredObligation(theory);
    expect(obligation).not.toBeNull();

    const wrongTheoryDocument: JsonObject = {
      ...pure.document,
      theory: "theory.some-other-contract",
    };
    const wrongTheoryRealization = await runBun(
      normalizeRealization(wrongTheoryDocument, theory, THEORY_ID),
    );

    const baseSuite = fixture.evidenceSuites[0]!;
    const staleSuite: JsonObject = { ...baseSuite, theory_identity: "sha256:stale-suite" };
    const wrongObligationSuite: JsonObject = {
      ...baseSuite,
      obligation: "obligation.inventory.unrelated",
    };

    const scenarios = [
      { label: "wrong theory", realization: wrongTheoryRealization, obligation, suites: fixture.evidenceSuites },
      { label: "obligation unsupported", realization: pure, obligation: null, suites: fixture.evidenceSuites },
      { label: "missing suite", realization: pure, obligation, suites: [] },
      { label: "ambiguous suite", realization: pure, obligation, suites: [baseSuite, baseSuite] },
      { label: "stale suite", realization: pure, obligation, suites: [staleSuite] },
      { label: "wrong-obligation suite", realization: pure, obligation, suites: [wrongObligationSuite] },
    ] as const;

    for (const scenario of scenarios) {
      const spy = spyEvidenceAdapters();
      const outcome = await runBun(produceEvidence(
        theory,
        THEORY_ID,
        scenario.obligation,
        scenario.realization,
        scenario.suites,
        spy.adapters,
      ));
      expect(outcome.ok).toBeFalse();
      expect(spy.calls).toEqual([]);
    }
  });

  test("an adapter-thrown DocumentError becomes an unbound_operation diagnostic without running conformance", async () => {
    const { fixture, theory, pure } = await loadPureAndBroken();
    const obligation = requiredObligation(theory);
    const replayCalls: Array<string> = [];
    const adapters: EvidenceAdapters = {
      resolveTransition: () => {
        throw new DocumentError({
          message: "unbound transition operation 'inventory.unavailable.v0'",
        });
      },
      resolveReplay: (key) => {
        replayCalls.push(key);
        return resolveReplay(key);
      },
    };
    const outcome = await runBun(
      produceEvidence(theory, THEORY_ID, obligation, pure, fixture.evidenceSuites, adapters),
    );
    expect(outcome.ok).toBeFalse();
    if (outcome.ok) throw new Error("expected an unbound_operation diagnostic");
    expect(outcome.diagnostic.kind).toBe("unbound_operation");
    expect(outcome.diagnostic.message).toContain("unbound transition operation");
    // resolveReplay is only reached after resolveTransition returns
    // normally; a thrown DocumentError from resolveTransition must
    // short-circuit before replay resolution, let alone conformance
    // execution.
    expect(replayCalls).toEqual([]);
  });

  test("an adapter throwing a non-DocumentError value fails produceEvidence with a wrapping DocumentError, never a ProducerOutcome", async () => {
    const { fixture, theory, pure } = await loadPureAndBroken();
    const obligation = requiredObligation(theory);
    const adapters: EvidenceAdapters = {
      resolveTransition: () => {
        throw new Error("boom");
      },
      resolveReplay,
    };
    const effect = produceEvidence(
      theory,
      THEORY_ID,
      obligation,
      pure,
      fixture.evidenceSuites,
      adapters,
    );
    const exit = await Effect.runPromiseExit(provideBun(effect));
    expect(Exit.isSuccess(exit)).toBeFalse();
    expect(Exit.isFailure(exit)).toBeTrue();
    if (Exit.isFailure(exit)) {
      const rendered = String(exit.cause);
      expect(rendered).toContain("cannot resolve realization operations");
      expect(rendered).toContain("boom");
    }
  });

  test("the real pure and broken evidence artifacts round-trip losslessly through evidenceToJson/parseEvidenceResult", async () => {
    const { fixture, theory, pure, broken } = await loadPureAndBroken();
    const obligation = requiredObligation(theory);
    const adapters: EvidenceAdapters = { resolveTransition, resolveReplay };
    for (const realization of [pure, broken]) {
      const outcome = await runBun(
        produceEvidence(theory, THEORY_ID, obligation, realization, fixture.evidenceSuites, adapters),
      );
      if (!outcome.ok) throw new Error("expected evidence production to succeed");
      const json = evidenceToJson(outcome.result);
      const parsed = await runBun(parseEvidenceResult(json));
      expect(parsed).toEqual(outcome.result);
    }
  });

  test("produceEvidence yields deterministic recipe and result identities for the same inputs", async () => {
    const { fixture, theory, pure } = await loadPureAndBroken();
    const obligation = requiredObligation(theory);
    const adapters: EvidenceAdapters = { resolveTransition, resolveReplay };
    const first = await runBun(
      produceEvidence(theory, THEORY_ID, obligation, pure, fixture.evidenceSuites, adapters),
    );
    const second = await runBun(
      produceEvidence(theory, THEORY_ID, obligation, pure, fixture.evidenceSuites, adapters),
    );
    if (!first.ok || !second.ok) throw new Error("expected the pure realization to produce evidence");
    expect(first.result.recipeIdentity).toStartWith("sha256:");
    expect(first.result.identity).toStartWith("sha256:");
    expect(second.result.recipeIdentity).toBe(first.result.recipeIdentity);
    expect(second.result.identity).toBe(first.result.identity);
  });

  test("a meaning-bearing case mutation changes recipe and result identity", async () => {
    const { fixture, theory, pure } = await loadPureAndBroken();
    const obligation = requiredObligation(theory);
    const adapters: EvidenceAdapters = { resolveTransition, resolveReplay };
    const baseline = await runBun(
      produceEvidence(theory, THEORY_ID, obligation, pure, fixture.evidenceSuites, adapters),
    );
    if (!baseline.ok) throw new Error("expected the pure realization to produce evidence");

    const baseSuite = fixture.evidenceSuites[0]!;
    const mutatedSuite = structuredClone(baseSuite) as Record<string, unknown>;
    const cases = mutatedSuite.cases as Array<Record<string, unknown>>;
    // Renaming the first case's declared ID is a meaning-bearing recipe
    // mutation: `id` is a semantic field of the hashed `cases` array, unlike
    // the recipe's own top-level `name` (see the sibling test below).
    cases[0]!.id = "reserve-and-release-mutated-for-identity-oracle";

    const mutated = await runBun(
      produceEvidence(theory, THEORY_ID, obligation, pure, [mutatedSuite as JsonObject], adapters),
    );
    if (!mutated.ok) throw new Error("expected the pure realization to produce evidence");
    expect(mutated.result.recipeIdentity).not.toBe(baseline.result.recipeIdentity);
    expect(mutated.result.identity).not.toBe(baseline.result.identity);
  });

  test("changing only the recipe's name does not change recipe identity", async () => {
    const { fixture, theory, pure } = await loadPureAndBroken();
    const obligation = requiredObligation(theory);
    const adapters: EvidenceAdapters = { resolveTransition, resolveReplay };
    const baseline = await runBun(
      produceEvidence(theory, THEORY_ID, obligation, pure, fixture.evidenceSuites, adapters),
    );
    if (!baseline.ok) throw new Error("expected the pure realization to produce evidence");

    const baseSuite = fixture.evidenceSuites[0]!;
    const renamedSuite: JsonObject = {
      ...baseSuite,
      name: "A completely different presentation-only recipe name",
    };
    const renamed = await runBun(
      produceEvidence(theory, THEORY_ID, obligation, pure, [renamedSuite], adapters),
    );
    if (!renamed.ok) throw new Error("expected the pure realization to produce evidence");
    expect(renamed.result.recipeIdentity).toBe(baseline.result.recipeIdentity);
    expect(renamed.result.identity).toBe(baseline.result.identity);
  });

  test("the evidence-result parser rejects the authored conformance recipe as evidence", async () => {
    const recipe = await readJson(join(INVENTORY, "evidence", "conformance-v0.json"));
    await expectFailure(parseEvidenceResult(recipe), "artifact_kind");
  });

  test("the evidence-result parser accepts a valid artifact and rejects every required mutation with a stable message", async () => {
    const { fixture, theory, pure } = await loadPureAndBroken();
    const obligation = requiredObligation(theory);
    const adapters: EvidenceAdapters = { resolveTransition, resolveReplay };
    const outcome = await runBun(
      produceEvidence(theory, THEORY_ID, obligation, pure, fixture.evidenceSuites, adapters),
    );
    if (!outcome.ok) throw new Error("expected the pure realization to produce evidence");
    const valid = evidenceToJson(outcome.result);

    const accepted = await runBun(parseEvidenceResult(valid));
    expect(accepted).toEqual(outcome.result);

    const mutate = (overrides: JsonObject): JsonObject => ({ ...valid, ...overrides });

    await expectFailure(
      parseEvidenceResult(mutate({ artifact_kind: "conformance_suite" })),
      "artifact_kind",
    );
    await expectFailure(parseEvidenceResult(mutate({ schema_version: 2 })), "schema_version");
    await expectFailure(parseEvidenceResult(mutate({ category: "proof" })), "category");
    await expectFailure(
      parseEvidenceResult(mutate({ identity: "sha256:tampered-stored-identity" })),
      "identity mismatch",
    );
    await expectFailure(parseEvidenceResult(mutate({ passed: !valid.passed })), "passed mismatch");
    await expectFailure(
      parseEvidenceResult(mutate({ total_cases: (valid.total_cases as number) + 1 })),
      "total_cases mismatch",
    );
    await expectFailure(
      parseEvidenceResult(mutate({ passed_cases: (valid.passed_cases as number) + 1 })),
      "passed_cases mismatch",
    );
    await expectFailure(
      parseEvidenceResult(
        mutate({ counterexamples: [{ case_id: "forged", passed: false, detail: null }] }),
      ),
      "counterexamples mismatch",
    );
    await expectFailure(
      parseEvidenceResult(mutate({ case_results: [] })),
      "case_results must not be empty",
    );
    const rawCases = valid.case_results as ReadonlyArray<JsonObject>;
    await expectFailure(
      parseEvidenceResult(mutate({ case_results: [...rawCases, rawCases[0]!] })),
      "duplicate case ID",
    );
  });

  test("scanImportSpecifiers recognizes every import form and discovers nested bare fs dependencies", async () => {
    const root = await mkdtemp(join(tmpdir(), "semantic-import-scan-"));
    temporaryRoots.push(root);
    const write = async (name: string, content: string): Promise<string> => {
      const path = join(root, name);
      await Bun.write(path, content);
      return path;
    };

    await write("named.ts", "export const a = 1;\n");
    await write("side-effect.ts", "export const sideEffect = true;\n");
    await write("reexport-star.ts", "export const x = 1;\n");
    await write("reexport-named.ts", "export const b = 2;\n");
    await write("type-only.ts", "export interface T { readonly id: string }\n");
    await write("import-equals-target.ts", "export const ok = true;\n");
    await write("no-semicolon.ts", "export const e = 5;\n");
    await write("multiline.ts", "export const c = 1;\nexport const d = 2;\n");
    // The bare fs dependencies live two hops from entry.ts (only reachable
    // through the dynamic import below), proving the closure walk finds
    // bare imports nested past the entry file, not only ones it declares
    // directly.
    await write(
      "dynamic.ts",
      [
        'import { readFile } from "node:fs";',
        'import fs from "fs";',
        'import { readFile as readFileP } from "fs/promises";',
        "export const dynamicMarker = { readFile, fs, readFileP };",
      ].join("\n") + "\n",
    );

    const entryPath = await write(
      "entry.ts",
      [
        'import { a } from "./named.ts";',
        'import "./side-effect.ts";', // side-effect import
        'export * from "./reexport-star.ts";', // star re-export
        'export { b } from "./reexport-named.ts";', // named re-export
        'import type { T } from "./type-only.ts";', // type-only import
        'import eq = require("./import-equals-target.ts");', // import-equals
        'import { e } from "./no-semicolon.ts"', // ASI, no trailing semicolon
        "export const afterNoSemicolon = e;",
        '/* decoy comment: import "./comment-decoy.ts" */',
        '// decoy line comment: import "./line-comment-decoy.ts"',
        'const stringDecoy = "import x from \\"./string-decoy.ts\\"";',
        'const templateDecoy = `export * from "./template-decoy.ts"`;',
        "import {", // multiline import
        "  c,",
        "  d,",
        '} from "./multiline.ts";',
        'export const loadDynamic = () => import("./dynamic.ts");', // nested dynamic import
      ].join("\n") + "\n",
    );

    const closure = await transitiveRelativeImportClosure(entryPath);
    const visitedBasenames = [...closure.files].map((path) => path.split("/").pop()!);

    for (const expectedFile of [
      "entry.ts",
      "named.ts",
      "side-effect.ts",
      "reexport-star.ts",
      "reexport-named.ts",
      "type-only.ts",
      "import-equals-target.ts",
      "no-semicolon.ts",
      "multiline.ts",
      "dynamic.ts",
    ]) {
      expect(visitedBasenames).toContain(expectedFile);
    }
    // The decoy files are never written to disk; if the scanner had
    // false-positively captured any decoy specifier, resolving and reading
    // that nonexistent file would have thrown before reaching this point.
    for (const decoyFile of [
      "comment-decoy.ts",
      "line-comment-decoy.ts",
      "string-decoy.ts",
      "template-decoy.ts",
    ]) {
      expect(visitedBasenames).not.toContain(decoyFile);
    }

    expect([...closure.bareImports]).toContain("node:fs");
    expect([...closure.bareImports]).toContain("fs");
    expect([...closure.bareImports]).toContain("fs/promises");
  });

  test("resolver.ts's transitive relative-import closure never reaches evidence production, execution, or I/O", async () => {
    const entry = join(ROOT, "src", "tracer", "resolver.ts");
    const closure = await transitiveRelativeImportClosure(entry);

    // Files the closure must never contain, by basename, regardless of how
    // many relative-import hops away they are.
    const forbiddenBasenames = [
      "evidence.ts",
      "domain.ts",
      "operations.ts",
      "execution.ts",
      "demo.ts",
      "loader.ts",
    ];
    const visitedBasenames = [...closure.files].map((path) => path.split("/").pop()!);
    for (const basename of forbiddenBasenames) {
      expect(visitedBasenames).not.toContain(basename);
    }

    // Exact allowlist, not a denylist: any bare/`node:` specifier reachable
    // anywhere in the closure other than "effect" itself is disallowed,
    // including ones a denylist could omit by name (e.g. "fs", plain
    // "fs/promises" without the "node:" prefix).
    const ALLOWED_BARE_IMPORTS = new Set(["effect"]);
    const disallowedBareImports = [...closure.bareImports].filter(
      (specifier) => !ALLOWED_BARE_IMPORTS.has(specifier),
    );
    expect(disallowedBareImports).toEqual([]);

    // Belt-and-suspenders: the producer runner symbols must not appear
    // anywhere in the closure's combined source, even under a re-export
    // alias that the basename check above would miss.
    const combinedSource = [...closure.sources.values()].join("\n");
    for (const symbol of ["runConformance", "produceEvidence"]) {
      expect(combinedSource).not.toContain(symbol);
    }
  });
});
