import { afterEach, describe, expect, test } from "bun:test";
import { cp, mkdtemp, rm, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { BunCrypto, BunFileSystem, BunPath } from "@effect/platform-bun";
import { NodeCrypto, NodeFileSystem, NodePath } from "@effect/platform-node";
import { Effect, Exit, Result, type Crypto, type FileSystem, type Path } from "effect";
import * as tsAst from "typescript/unstable/ast";
import { demoToJson, runDemo } from "../src/tracer/demo.ts";
import { produceEvidence, runConformance, type EvidenceAdapters } from "../src/tracer/evidence.ts";
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
import {
  normalizeRealization,
  operationBinding,
  realizationId,
} from "../src/tracer/realization.ts";
import {
  ARTIFACT_KIND_RESOLUTION_CLAIM,
  RESOLUTION_CLAIM_SCHEMA_VERSION,
  buildResolutionClaim,
  parseResolutionClaim,
  resolutionClaimToJson,
  type ResolutionClaimCandidate,
} from "../src/tracer/resolution-claim.ts";
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
    const resolution = await runBun(
      resolveDeployment(theory, [realization], [outcome], fixture.policy),
    );
    expect(resolution.status).toBe("selected");
    const candidate = resolution.candidates[0]!;
    expect(candidate.eligible).toBeTrue();
    expect(candidate.evidence).toEqual(injected);
    expect(candidate.producerDiagnostic).toBeNull();
  });

  test("resolver rejects an injected result with a tampered identity before it can reach selection", async () => {
    // `ProducerOutcome`/`EvidenceResult` are plain data shapes: nothing in
    // their TypeScript types stops a caller from hand-building one whose
    // stored `identity` does not match its own content. Only the
    // `identity` field is tampered here; the realization/theory binding
    // `bindOutcomes` checks is otherwise fully valid, so only the
    // resolver's own internal-consistency validation (parseEvidenceResult)
    // can catch this.
    const { fixture, theory, realization } = await loadPureRealization();
    const injectedFields: Omit<EvidenceResult, "identity"> = {
      artifactKind: ARTIFACT_KIND_EVIDENCE_RESULT,
      schemaVersion: EVIDENCE_RESULT_SCHEMA_VERSION,
      category: "example_test",
      producer: { id: "producer.injected", version: "0" },
      recipeIdentity: "sha256:fixture-injected-recipe-tampered",
      theoryIdentity: theory.identity,
      realizationIdentity: realization.identity,
      obligation: "obligation.inventory.conformance",
      assumptions: [],
      caseResults: [{ caseId: "injected-case", passed: true, detail: null }],
    };
    const injectedIdentity = await runBun(
      contentIdentity(evidenceResultIdentityPayload(injectedFields)),
    );
    const tamperedResult: EvidenceResult = {
      identity: `${injectedIdentity}-tampered`,
      ...injectedFields,
    };
    const outcome: ProducerOutcome = {
      ok: true,
      realizationId: realizationId(realization),
      realizationIdentity: realization.identity,
      result: tamperedResult,
    };
    await expectFailure(
      resolveDeployment(theory, [realization], [outcome], fixture.policy),
      "identity mismatch",
    );
  });

  test("resolver rejects an injected result with duplicate case IDs before it can reach selection", async () => {
    const { fixture, theory, realization } = await loadPureRealization();
    const duplicatedFields: Omit<EvidenceResult, "identity"> = {
      artifactKind: ARTIFACT_KIND_EVIDENCE_RESULT,
      schemaVersion: EVIDENCE_RESULT_SCHEMA_VERSION,
      category: "example_test",
      producer: { id: "producer.injected", version: "0" },
      recipeIdentity: "sha256:fixture-injected-recipe-duplicate",
      theoryIdentity: theory.identity,
      realizationIdentity: realization.identity,
      obligation: "obligation.inventory.conformance",
      assumptions: [],
      caseResults: [
        { caseId: "duplicated-case", passed: true, detail: null },
        { caseId: "duplicated-case", passed: true, detail: null },
      ],
    };
    // Fully refreshed: the identity is recomputed for this exact (invalid)
    // case list, so rejection can only come from the duplicate-ID rule
    // itself, never a stale hash.
    const duplicatedIdentity = await runBun(
      contentIdentity(evidenceResultIdentityPayload(duplicatedFields)),
    );
    const duplicatedResult: EvidenceResult = {
      identity: duplicatedIdentity,
      ...duplicatedFields,
    };
    const outcome: ProducerOutcome = {
      ok: true,
      realizationId: realizationId(realization),
      realizationIdentity: realization.identity,
      result: duplicatedResult,
    };
    await expectFailure(
      resolveDeployment(theory, [realization], [outcome], fixture.policy),
      "duplicate case ID",
    );
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
    const resolution = await runBun(
      resolveDeployment(theory, [realization], [outcome], fixture.policy),
    );
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
    const outcome = await runBun(
      produceEvidence(
        theory,
        THEORY_ID,
        obligation,
        wrongTheoryRealization,
        fixture.evidenceSuites,
        adapters,
      ),
    );
    if (outcome.ok) throw new Error("expected a not_targeted diagnostic");
    expect(outcome.diagnostic.kind).toBe("not_targeted");

    const resolution = await runBun(
      resolveDeployment(theory, [wrongTheoryRealization], [outcome], fixture.policy),
    );
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
    const outcome = await runBun(
      produceEvidence(theory, THEORY_ID, null, pure, fixture.evidenceSuites, adapters),
    );
    if (outcome.ok) throw new Error("expected an obligation_unsupported diagnostic");
    expect(outcome.diagnostic.kind).toBe("obligation_unsupported");

    const resolution = await runBun(resolveDeployment(theory, [pure], [outcome], fixture.policy));
    const candidate = resolution.candidates[0]!;
    expect(candidate.reasonCodes).toEqual(["required_obligation_set_unsupported"]);
    expect(candidate.producerDiagnostic).toEqual(outcome.diagnostic);
  });

  test("resolver rejects duplicate authored realization IDs before binding outcomes", async () => {
    const { fixture, theory, pure } = await loadPureAndBroken();
    const obligation = requiredObligation(theory);
    const adapters: EvidenceAdapters = { resolveTransition, resolveReplay };
    const pureOutcome = await runBun(
      produceEvidence(theory, THEORY_ID, obligation, pure, fixture.evidenceSuites, adapters),
    );
    await expectFailure(
      resolveDeployment(theory, [pure, pure], [pureOutcome], fixture.policy),
      "duplicate authored realization ID",
    );
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
    const pureOutcome = await runBun(
      produceEvidence(theory, THEORY_ID, obligation, pure, fixture.evidenceSuites, adapters),
    );
    // A naive Set/Map binding by ID alone would collapse `pure` and
    // `variant` into one entry and could still resolve to a selection
    // without ever surfacing that two distinct, differently-identitied
    // realizations claimed the same authored ID (the review probe).
    await expectFailure(
      resolveDeployment(theory, [pure, variant], [pureOutcome], fixture.policy),
      "duplicate authored realization ID",
    );
  });

  test("resolver binds outcomes by realization identity, not array order", async () => {
    const { fixture, theory, pure, broken } = await loadPureAndBroken();
    const obligation = requiredObligation(theory);
    const adapters: EvidenceAdapters = { resolveTransition, resolveReplay };
    const pureOutcome = await runBun(
      produceEvidence(theory, THEORY_ID, obligation, pure, fixture.evidenceSuites, adapters),
    );
    const brokenOutcome = await runBun(
      produceEvidence(theory, THEORY_ID, obligation, broken, fixture.evidenceSuites, adapters),
    );
    // Realizations and outcomes are each passed in reversed, mismatched
    // order; correct binding must come from identity, not position.
    const resolution = await runBun(
      resolveDeployment(theory, [broken, pure], [pureOutcome, brokenOutcome], fixture.policy),
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
    const pureOutcome = await runBun(
      produceEvidence(theory, THEORY_ID, obligation, pure, fixture.evidenceSuites, adapters),
    );
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
    await expectFailure(
      resolveDeployment(theory, [pure, broken], [pureOutcome, reboundOutcome], fixture.policy),
      "evidence result for realization 'realization.inventory.broken' carries a mismatched realization identity",
    );
  });

  test("DEFERRED: a fully refreshed rebind of passing cases onto the broken realization is not caught by this partial slice", async () => {
    const { fixture, theory, pure, broken } = await loadPureAndBroken();
    const obligation = requiredObligation(theory);
    const adapters: EvidenceAdapters = { resolveTransition, resolveReplay };
    const pureOutcome = await runBun(
      produceEvidence(theory, THEORY_ID, obligation, pure, fixture.evidenceSuites, adapters),
    );
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
    const resolution = await runBun(
      resolveDeployment(theory, [broken], [forgedOutcome], fixture.policy),
    );
    expect(resolution.status).toBe("selected");
    expect(resolution.selectedRealization).toBe("realization.inventory.broken");
  });

  test("a diagnostic rebound to a mismatched realization identity is rejected deterministically", async () => {
    const { fixture, theory, pure, broken } = await loadPureAndBroken();
    const obligation = requiredObligation(theory);
    const adapters: EvidenceAdapters = { resolveTransition, resolveReplay };
    const pureOutcome = await runBun(
      produceEvidence(theory, THEORY_ID, obligation, pure, fixture.evidenceSuites, adapters),
    );
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
    await expectFailure(
      resolveDeployment(theory, [pure, broken], [pureOutcome, misboundDiagnostic], fixture.policy),
      "mismatched realization identity",
    );
  });

  test("a successful result bound to a mismatched theory identity is rejected deterministically", async () => {
    const { fixture, theory, pure } = await loadPureAndBroken();
    const obligation = requiredObligation(theory);
    const adapters: EvidenceAdapters = { resolveTransition, resolveReplay };
    const pureOutcome = await runBun(
      produceEvidence(theory, THEORY_ID, obligation, pure, fixture.evidenceSuites, adapters),
    );
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
    await expectFailure(
      resolveDeployment(theory, [pure], [wrongTheoryOutcome], fixture.policy),
      "mismatched theory identity",
    );
  });

  test("resolver rejects a missing evidence-production outcome instead of defaulting", async () => {
    const { fixture, theory, pure, broken } = await loadPureAndBroken();
    const obligation = requiredObligation(theory);
    const adapters: EvidenceAdapters = { resolveTransition, resolveReplay };
    const pureOutcome = await runBun(
      produceEvidence(theory, THEORY_ID, obligation, pure, fixture.evidenceSuites, adapters),
    );
    await expectFailure(
      resolveDeployment(theory, [pure, broken], [pureOutcome], fixture.policy),
      "missing evidence-production outcome",
    );
  });

  test("resolver rejects two outcomes bound to the same realization identity", async () => {
    const { fixture, theory, pure } = await loadPureAndBroken();
    const obligation = requiredObligation(theory);
    const adapters: EvidenceAdapters = { resolveTransition, resolveReplay };
    const pureOutcome = await runBun(
      produceEvidence(theory, THEORY_ID, obligation, pure, fixture.evidenceSuites, adapters),
    );
    await expectFailure(
      resolveDeployment(theory, [pure], [pureOutcome, pureOutcome], fixture.policy),
      "duplicate evidence-production outcome",
    );
  });

  test("resolver rejects an outcome bound to a realization outside the current set", async () => {
    const { fixture, theory, pure, broken } = await loadPureAndBroken();
    const obligation = requiredObligation(theory);
    const adapters: EvidenceAdapters = { resolveTransition, resolveReplay };
    const pureOutcome = await runBun(
      produceEvidence(theory, THEORY_ID, obligation, pure, fixture.evidenceSuites, adapters),
    );
    const brokenOutcome = await runBun(
      produceEvidence(theory, THEORY_ID, obligation, broken, fixture.evidenceSuites, adapters),
    );
    await expectFailure(
      resolveDeployment(theory, [pure], [pureOutcome, brokenOutcome], fixture.policy),
      "unknown realization",
    );
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
      {
        label: "wrong theory",
        realization: wrongTheoryRealization,
        obligation,
        suites: fixture.evidenceSuites,
      },
      {
        label: "obligation unsupported",
        realization: pure,
        obligation: null,
        suites: fixture.evidenceSuites,
      },
      { label: "missing suite", realization: pure, obligation, suites: [] },
      { label: "ambiguous suite", realization: pure, obligation, suites: [baseSuite, baseSuite] },
      { label: "stale suite", realization: pure, obligation, suites: [staleSuite] },
      {
        label: "wrong-obligation suite",
        realization: pure,
        obligation,
        suites: [wrongObligationSuite],
      },
    ] as const;

    for (const scenario of scenarios) {
      const spy = spyEvidenceAdapters();
      const outcome = await runBun(
        produceEvidence(
          theory,
          THEORY_ID,
          scenario.obligation,
          scenario.realization,
          scenario.suites,
          spy.adapters,
        ),
      );
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

  test("an adapter throwing an arbitrary non-DocumentError object fails produceEvidence with a reference-preserving DocumentError", async () => {
    const { fixture, theory, pure } = await loadPureAndBroken();
    const obligation = requiredObligation(theory);
    const thrown = { marker: "arbitrary-adapter-defect" };
    const adapters: EvidenceAdapters = {
      resolveTransition: () => {
        throw thrown;
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
    const result = await runBun(effect.pipe(Effect.result));
    expect(Result.isFailure(result)).toBeTrue();
    if (Result.isFailure(result)) {
      expect(result.failure).toBeInstanceOf(DocumentError);
      expect(result.failure.message).toBe("cannot resolve realization operations");
      // Reference equality (not a deep/structural clone): the exact thrown
      // object must survive unchanged as `.cause`.
      expect(result.failure.cause).toBe(thrown);
    }
  });

  test("a realization missing the transition operation binding fails produceEvidence before any adapter call", async () => {
    const { fixture, theory, pure } = await loadPureAndBroken();
    const obligation = requiredObligation(theory);
    const operations = pure.document.operations as JsonObject;
    const missingBindingDocument: JsonObject = {
      ...pure.document,
      operations: Object.fromEntries(
        Object.entries(operations).filter(([key]) => key !== "transition"),
      ),
    };
    const missingBindingRealization = await runBun(
      normalizeRealization(missingBindingDocument, theory, THEORY_ID),
    );
    const spy = spyEvidenceAdapters();
    const effect = produceEvidence(
      theory,
      THEORY_ID,
      obligation,
      missingBindingRealization,
      fixture.evidenceSuites,
      spy.adapters,
    );
    const exit = await Effect.runPromiseExit(provideBun(effect));
    expect(Exit.isSuccess(exit)).toBeFalse();
    expect(Exit.isFailure(exit)).toBeTrue();
    if (Exit.isFailure(exit)) {
      const rendered = String(exit.cause);
      expect(rendered).toContain("realization.operations");
      expect(rendered).toContain("transition");
    }
    // A binding-decoding failure must never reach the adapters at all —
    // it fails before `resolveTransition`/`resolveReplay` are ever called,
    // distinct from an adapter itself rejecting a well-formed key.
    expect(spy.calls).toEqual([]);
  });

  test("the real pure and broken evidence artifacts round-trip losslessly through evidenceToJson/parseEvidenceResult", async () => {
    const { fixture, theory, pure, broken } = await loadPureAndBroken();
    const obligation = requiredObligation(theory);
    const adapters: EvidenceAdapters = { resolveTransition, resolveReplay };
    for (const realization of [pure, broken]) {
      const outcome = await runBun(
        produceEvidence(
          theory,
          THEORY_ID,
          obligation,
          realization,
          fixture.evidenceSuites,
          adapters,
        ),
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
    if (!first.ok || !second.ok)
      throw new Error("expected the pure realization to produce evidence");
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
    const emptyIdCases = rawCases.map((item, index) =>
      index === 0 ? { ...item, case_id: "" } : item,
    );
    await expectFailure(parseEvidenceResult(mutate({ case_results: emptyIdCases })), "nonempty");

    // Adding an extra key changes nothing the identity payload reads, so
    // the recomputed identity still matches the stored one exactly — this
    // proves rejection comes only from the closed-key-set check itself,
    // not from any hash refresh.
    await expectFailure(
      parseEvidenceResult(mutate({ unsigned_top_level: "unsigned-value" })),
      "unknown top-level key",
    );
    const caseWithUnsignedField = { ...rawCases[0]!, unsigned_case_field: "unsigned-value" };
    await expectFailure(
      parseEvidenceResult(mutate({ case_results: [caseWithUnsignedField, ...rawCases.slice(1)] })),
      "unknown key",
    );

    // Fully refreshed empty-binding mutations: each of these fields must be
    // rejected as empty by the field-specific nonempty check, not by an
    // incidental identity mismatch, so the identity and every derived
    // aggregate are recomputed correctly for the mutated fields below.
    const baseFields: Omit<EvidenceResult, "identity"> = {
      artifactKind: outcome.result.artifactKind,
      schemaVersion: outcome.result.schemaVersion,
      category: outcome.result.category,
      producer: outcome.result.producer,
      recipeIdentity: outcome.result.recipeIdentity,
      theoryIdentity: outcome.result.theoryIdentity,
      realizationIdentity: outcome.result.realizationIdentity,
      obligation: outcome.result.obligation,
      assumptions: outcome.result.assumptions,
      caseResults: outcome.result.caseResults,
    };
    const emptyFieldMutations: ReadonlyArray<{
      readonly label: string;
      readonly fields: Omit<EvidenceResult, "identity">;
    }> = [
      {
        label: "producer.id",
        fields: { ...baseFields, producer: { ...baseFields.producer, id: "" } },
      },
      {
        label: "producer.version",
        fields: { ...baseFields, producer: { ...baseFields.producer, version: "" } },
      },
      { label: "recipe_identity", fields: { ...baseFields, recipeIdentity: "" } },
      { label: "theory_identity", fields: { ...baseFields, theoryIdentity: "" } },
      { label: "realization_identity", fields: { ...baseFields, realizationIdentity: "" } },
      { label: "obligation", fields: { ...baseFields, obligation: "" } },
    ];
    for (const mutation of emptyFieldMutations) {
      const mutatedIdentity = await runBun(
        contentIdentity(evidenceResultIdentityPayload(mutation.fields)),
      );
      const mutatedJson = evidenceToJson({ identity: mutatedIdentity, ...mutation.fields });
      await expectFailure(parseEvidenceResult(mutatedJson), mutation.label);
    }
  });

  test("produceEvidence and runConformance reject a malformed recipe envelope with a stable message before adapter resolution or case execution", async () => {
    const { fixture, theory, pure } = await loadPureAndBroken();
    const obligation = requiredObligation(theory);
    const baseSuite = fixture.evidenceSuites[0]!;

    const expectEnvelopeRejection = async (mutatedSuite: JsonObject, message: string) => {
      const spy = spyEvidenceAdapters();
      await expectFailure(
        produceEvidence(theory, THEORY_ID, obligation, pure, [mutatedSuite], spy.adapters),
        message,
      );
      // Every envelope violation must be caught before any adapter is
      // resolved, matching the six zero-adapter-call preflight scenarios
      // already covered for theory/obligation/staleness mismatches.
      expect(spy.calls).toEqual([]);
    };

    await expectEnvelopeRejection({ ...baseSuite, kind: "resolution_claim" }, "kind");
    await expectEnvelopeRejection({ ...baseSuite, schema_version: 2 }, "schema_version");
    await expectEnvelopeRejection(
      { ...baseSuite, producer: { id: "", version: "0" } },
      "producer.id",
    );
    await expectEnvelopeRejection(
      { ...baseSuite, producer: { id: "producer.test", version: "" } },
      "producer.version",
    );
    await expectEnvelopeRejection({ ...baseSuite, execution_seed: 42 }, "unknown top-level key");
    // A valid string `name` is accepted (and stays excluded from the recipe
    // identity, per the sibling name-identity test); only a non-string
    // `name` is rejected.
    await expectEnvelopeRejection({ ...baseSuite, name: 42 }, "suite.name must be a string");
    await expectEnvelopeRejection({ ...baseSuite, cases: [] }, "cases must not be empty");

    const rawCases = baseSuite.cases as ReadonlyArray<JsonObject>;
    const duplicatedCases = [...rawCases];
    duplicatedCases[1] = { ...duplicatedCases[0]! };
    await expectEnvelopeRejection({ ...baseSuite, cases: duplicatedCases }, "duplicate case ID");

    const emptyIdCases = rawCases.map((item, index) => (index === 0 ? { ...item, id: "" } : item));
    await expectEnvelopeRejection({ ...baseSuite, cases: emptyIdCases }, "nonempty");

    // runConformance shares the same validator, so calling it directly with
    // a malformed recipe (bypassing produceEvidence entirely) must also
    // reject before any case executes. Counting transition/replay calls
    // (rather than reusing the real operations) proves phase ordering
    // directly: a real transition/replay would silently succeed even if
    // called, so passing them earlier could not distinguish "validated
    // first" from "executed first and happened to still pass."
    let transitionCalls = 0;
    let replayCalls = 0;
    const countingTransition: Parameters<typeof runConformance>[4] = (...args) => {
      transitionCalls += 1;
      return resolveTransition(operationBinding(pure.document, "transition"))(...args);
    };
    const countingReplay: Parameters<typeof runConformance>[5] = (...args) => {
      replayCalls += 1;
      return resolveReplay(operationBinding(pure.document, "replay"))(...args);
    };
    await expectFailure(
      runConformance(
        theory,
        THEORY_ID,
        pure,
        { ...baseSuite, execution_seed: "unauthorized" },
        countingTransition,
        countingReplay,
      ),
      "unknown top-level key",
    );
    expect(transitionCalls).toBe(0);
    expect(replayCalls).toBe(0);
  });

  test("runConformance binds the recipe to the exact supplied theory before any transition/replay call", async () => {
    const { fixture, theory, pure } = await loadPureAndBroken();
    const baseSuite = fixture.evidenceSuites[0]!;

    const expectDirectRejection = async (
      suite: JsonObject,
      theoryId: string,
      message: string,
    ): Promise<void> => {
      let transitionCalls = 0;
      let replayCalls = 0;
      const countingTransition: Parameters<typeof runConformance>[4] = (...args) => {
        transitionCalls += 1;
        return resolveTransition(operationBinding(pure.document, "transition"))(...args);
      };
      const countingReplay: Parameters<typeof runConformance>[5] = (...args) => {
        replayCalls += 1;
        return resolveReplay(operationBinding(pure.document, "replay"))(...args);
      };
      await expectFailure(
        runConformance(theory, theoryId, pure, suite, countingTransition, countingReplay),
        message,
      );
      expect(transitionCalls).toBe(0);
      expect(replayCalls).toBe(0);
    };

    // Foreign ID: the recipe's own declared `theory` does not match the
    // theory the caller actually supplied, even though `theory_identity`
    // still matches this exact Theory's content identity.
    await expectDirectRejection(baseSuite, "theory.some-other-contract", "not the supplied theory");

    // Foreign identity: the same declared theory ID, but a different
    // (well-formed-looking) content identity than the supplied Theory's.
    await expectDirectRejection(
      {
        ...baseSuite,
        theory_identity: "sha256:0000000000000000000000000000000000000000000000000000000000000000",
      },
      THEORY_ID,
      "foreign theory_identity",
    );

    // Empty identity: rejected by the nonempty check specifically, not the
    // foreign-identity equality check below it.
    await expectDirectRejection(
      { ...baseSuite, theory_identity: "" },
      THEORY_ID,
      "suite.theory_identity must be a nonempty string",
    );

    // Empty declared theory/id/obligation: rejected before any adapter
    // work. produceEvidence's own pre-existing theory/obligation
    // diagnostics would otherwise short-circuit on these same fields
    // earlier (as missing_evidence/stale_evidence_recipe), which is why
    // this exercises the shared validator directly instead.
    await expectDirectRejection(
      { ...baseSuite, theory: "" },
      THEORY_ID,
      "suite.theory must be a nonempty string",
    );
    await expectDirectRejection(
      { ...baseSuite, id: "" },
      THEORY_ID,
      "suite.id must be a nonempty string",
    );
    await expectDirectRejection(
      { ...baseSuite, obligation: "" },
      THEORY_ID,
      "suite.obligation must be a nonempty string",
    );
  });

  test("conformance_suite requires an explicit assumptions array; omission is rejected but an explicit empty array is accepted", async () => {
    const { fixture, theory, pure } = await loadPureAndBroken();
    const obligation = requiredObligation(theory);
    const baseSuite = fixture.evidenceSuites[0]!;
    const suiteWithoutAssumptions = Object.fromEntries(
      Object.entries(baseSuite).filter(([key]) => key !== "assumptions"),
    ) as JsonObject;

    const spy = spyEvidenceAdapters();
    await expectFailure(
      produceEvidence(theory, THEORY_ID, obligation, pure, [suiteWithoutAssumptions], spy.adapters),
      "assumptions",
    );
    expect(spy.calls).toEqual([]);

    // An explicit empty array is a different, valid declaration: it must
    // not be rejected, and it participates in the recipe identity exactly
    // like any other authored value (no special-cased normalization).
    const suiteWithExplicitEmptyAssumptions: JsonObject = { ...baseSuite, assumptions: [] };
    const adapters: EvidenceAdapters = { resolveTransition, resolveReplay };
    const outcome = await runBun(
      produceEvidence(
        theory,
        THEORY_ID,
        obligation,
        pure,
        [suiteWithExplicitEmptyAssumptions],
        adapters,
      ),
    );
    expect(outcome.ok).toBeTrue();
    if (!outcome.ok) throw new Error("expected the pure realization to produce evidence");
    expect(outcome.result.assumptions).toEqual([]);
  });

  test("evidence-result parser rejects a failed case with null detail even when identity and aggregates are fully refreshed", async () => {
    // Constructed as raw JSON, not the typed EvidenceResult/CaseResult
    // shape: CaseResult is a discriminated union that cannot represent this
    // deliberately invalid passed/detail combination through normal typed
    // construction (correctness by construction). This proves the PARSER
    // still rejects it when an untyped external document supplies it
    // directly, with the identity and every derived aggregate correctly
    // recomputed for this exact payload beforehand.
    const caseResultsJson: ReadonlyArray<JsonObject> = [
      { case_id: "case-pass", passed: true, detail: null },
      { case_id: "case-fail-with-null-detail", passed: false, detail: null },
    ];
    const payloadWithoutIdentity: JsonObject = {
      artifact_kind: ARTIFACT_KIND_EVIDENCE_RESULT,
      schema_version: EVIDENCE_RESULT_SCHEMA_VERSION,
      category: "example_test",
      producer: { id: "producer.test", version: "0" },
      recipe_identity: "sha256:fixture-recipe-for-shape-rule",
      theory_identity: "sha256:fixture-theory-for-shape-rule",
      realization_identity: "sha256:fixture-realization-for-shape-rule",
      obligation: "obligation.inventory.conformance",
      assumptions: [],
      case_results: caseResultsJson,
    };
    const identity = await runBun(contentIdentity(payloadWithoutIdentity));
    const json: JsonObject = {
      ...payloadWithoutIdentity,
      identity,
      // Sanity: every derived aggregate below is already fully
      // refreshed/self-consistent with this exact (malformed) case
      // payload — the shape rule inside the parser must be what rejects
      // this document, never a stale hash or a stale aggregate.
      passed: false,
      total_cases: 2,
      passed_cases: 1,
      counterexamples: [{ case_id: "case-fail-with-null-detail", passed: false, detail: null }],
    };

    await expectFailure(parseEvidenceResult(json), "detail");
  });

  test("evidence-result parser rejects a passed case with a non-null detail even when identity and aggregates are fully refreshed", async () => {
    const caseResultsJson: ReadonlyArray<JsonObject> = [
      { case_id: "case-pass-with-detail", passed: true, detail: { unexpected: "detail" } },
    ];
    const payloadWithoutIdentity: JsonObject = {
      artifact_kind: ARTIFACT_KIND_EVIDENCE_RESULT,
      schema_version: EVIDENCE_RESULT_SCHEMA_VERSION,
      category: "example_test",
      producer: { id: "producer.test", version: "0" },
      recipe_identity: "sha256:fixture-recipe-for-shape-rule-2",
      theory_identity: "sha256:fixture-theory-for-shape-rule-2",
      realization_identity: "sha256:fixture-realization-for-shape-rule-2",
      obligation: "obligation.inventory.conformance",
      assumptions: [],
      case_results: caseResultsJson,
    };
    const identity = await runBun(contentIdentity(payloadWithoutIdentity));
    const json: JsonObject = {
      ...payloadWithoutIdentity,
      identity,
      passed: true,
      total_cases: 1,
      passed_cases: 1,
      counterexamples: [],
    };

    await expectFailure(parseEvidenceResult(json), "detail");
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

  // resolution_claim_v1 (design spec 0003 slice 4): serialization,
  // deterministic presentation-only ordering, internal-coherence
  // validation, and the forbidden-import closure gate.
  const provideCrypto = <A, E>(effect: Effect.Effect<A, E, Crypto.Crypto>): Effect.Effect<A, E> =>
    effect.pipe(Effect.provide([BunCrypto.layer]));
  const runCrypto = <A, E>(effect: Effect.Effect<A, E, Crypto.Crypto>): Promise<A> =>
    Effect.runPromise(provideCrypto(effect));
  const expectClaimFailure = async (document: JsonObject, message: string) => {
    const exit = await Effect.runPromiseExit(provideCrypto(parseResolutionClaim(document)));
    expect(Exit.isFailure(exit)).toBeTrue();
    if (Exit.isFailure(exit)) expect(String(exit.cause)).toContain(message);
  };
  const developmentClaimJson = async (): Promise<JsonObject> =>
    resolutionClaimToJson((await runBun(runDemo(INVENTORY, "development"))).resolutionClaim);
  const highAssuranceClaimJson = async (): Promise<JsonObject> =>
    resolutionClaimToJson((await runBun(runDemo(INVENTORY, "high-assurance"))).resolutionClaim);
  const claimCandidate = (json: JsonObject, id: string): JsonObject =>
    (json.candidates as ReadonlyArray<JsonObject>).find(
      (item) => (item.realization as JsonObject).id === id,
    )!;
  const withCandidate = (
    json: JsonObject,
    id: string,
    patch: (candidate: JsonObject) => JsonObject,
  ): JsonObject => ({
    ...json,
    candidates: (json.candidates as ReadonlyArray<JsonObject>).map((item) =>
      (item.realization as JsonObject).id === id ? patch(item) : item,
    ),
  });
  // A genuinely well-formed `EvidenceResult` (its stored identity really is
  // the content identity of its own semantic payload), so a claim-level
  // rejection below can only be about the claim's own invariants and never
  // about malformed embedded evidence.
  const fixtureEvidence = async (
    realizationIdentity: string,
    obligation = "obligation.inventory.conformance",
  ): Promise<EvidenceResult> => {
    const withoutIdentity: Omit<EvidenceResult, "identity"> = {
      artifactKind: ARTIFACT_KIND_EVIDENCE_RESULT,
      schemaVersion: EVIDENCE_RESULT_SCHEMA_VERSION,
      category: "example_test",
      producer: { id: "producer.test", version: "0" },
      recipeIdentity: "sha256:fixture-recipe",
      theoryIdentity: "sha256:fixture-theory",
      realizationIdentity,
      obligation,
      assumptions: [],
      caseResults: [{ caseId: "case-a", passed: true, detail: null }],
    };
    const identity = await runBun(contentIdentity(evidenceResultIdentityPayload(withoutIdentity)));
    return { identity, ...withoutIdentity };
  };

  test("resolution_claim_v1 round-trips a selected claim losslessly", async () => {
    const json = await developmentClaimJson();
    expect(json.artifact_kind).toBe(ARTIFACT_KIND_RESOLUTION_CLAIM);
    expect(json.schema_version).toBe(RESOLUTION_CLAIM_SCHEMA_VERSION);
    expect(json.status).toBe("selected");
    expect((json.selected as JsonObject).id).toBe("realization.inventory.pure");
    const parsed = await runCrypto(parseResolutionClaim(json));
    expect(resolutionClaimToJson(parsed)).toEqual(json);
  });

  test("resolution_claim_v1 round-trips a rejected claim losslessly", async () => {
    const json = await highAssuranceClaimJson();
    expect(json.status).toBe("rejected");
    expect(json.selected).toBeNull();
    expect(json.selected_assumptions).toEqual([]);
    const parsed = await runCrypto(parseResolutionClaim(json));
    expect(resolutionClaimToJson(parsed)).toEqual(json);
  });

  test("exact policy content identity and selected realization identity are visible and independently recomputable", async () => {
    const fixture = await runBun(loadInventory(INVENTORY, "development"));
    const expectedPolicyIdentity = await runBun(contentIdentity(fixture.policy));
    const json = await developmentClaimJson();
    const policy = json.policy as JsonObject;
    expect(policy.id).toBe("policy.inventory.development");
    expect(policy.content_identity).toBe(expectedPolicyIdentity);
    const selected = json.selected as JsonObject;
    expect(selected.id).toBe("realization.inventory.pure");
    expect(selected.identity).toBe(
      "sha256:67a6b723fa37eaaa7fffe0890f27174f2d04027e05f3eaf8760d9a430a7201b9",
    );
  });

  test("selected assumptions are sorted, unique, and derived from both the realization and the evidence; rejected claims project none", async () => {
    const json = await developmentClaimJson();
    expect(json.selected_assumptions).toEqual([
      "All fixture quantities stay within JavaScript's exact safe-integer range.",
      "Operation binding names are interpreted by the in-process TypeScript builtin registry.",
      "The nine authored cases adequately sample the v0 contract for development selection.",
    ]);
    const rejectedJson = await highAssuranceClaimJson();
    expect(rejectedJson.selected_assumptions).toEqual([]);
  });

  test("reversed candidate and reason presentation order normalizes to identical JSON", async () => {
    const winner: ResolutionClaimCandidate = {
      realizationId: "realization.z",
      realizationIdentity: "sha256:fixture-realization-z",
      targetsTheory: true,
      realizationAssumptions: [],
      evidence: await fixtureEvidence("sha256:fixture-realization-z"),
      producerDiagnostic: null,
      eligible: true,
      reasonCodes: [],
    };
    const rejectedForward: ResolutionClaimCandidate = {
      realizationId: "realization.a",
      realizationIdentity: "sha256:fixture-realization-a",
      targetsTheory: true,
      realizationAssumptions: [],
      evidence: await fixtureEvidence("sha256:fixture-realization-a"),
      producerDiagnostic: null,
      eligible: false,
      reasonCodes: ["conformance_failed", "assumptions_not_allowed"],
    };
    const rejectedReversed: ResolutionClaimCandidate = {
      ...rejectedForward,
      reasonCodes: ["assumptions_not_allowed", "conformance_failed"],
    };
    const buildInput = {
      theoryId: "theory.fixture",
      theoryIdentity: "sha256:fixture-theory",
      requiredObligation: "obligation.inventory.conformance",
      policy: { id: "policy.fixture" },
      status: "selected" as const,
      selectedRealizationId: "realization.z",
    };
    const forward = await runCrypto(
      buildResolutionClaim({ ...buildInput, candidates: [winner, rejectedForward] }),
    );
    const reversed = await runCrypto(
      buildResolutionClaim({ ...buildInput, candidates: [rejectedReversed, winner] }),
    );
    const forwardJson = resolutionClaimToJson(forward);
    expect(resolutionClaimToJson(reversed)).toEqual(forwardJson);
    const candidateIds = (forwardJson.candidates as ReadonlyArray<JsonObject>).map(
      (item) => (item.realization as JsonObject).id,
    );
    expect(candidateIds).toEqual(["realization.a", "realization.z"]);
    expect((forwardJson.candidates as ReadonlyArray<JsonObject>)[0]!.reason_codes).toEqual([
      "assumptions_not_allowed",
      "conformance_failed",
    ]);
  });

  test("two distinct authored candidate IDs sharing one content identity round-trip without collapse and remain represented by the rejected ambiguity claim", async () => {
    const inventory = await copyInventory();
    const pure = (await readJson(join(inventory, "realizations", "pure.json"))) as Record<
      string,
      unknown
    >;
    pure.id = "realization.inventory.pure-copy";
    pure.name = "Second lawful pure realization";
    await writeJson(join(inventory, "realizations", "pure-copy.json"), pure);

    const result = await runBun(runDemo(inventory));
    expect(result.resolutionClaim.status).toBe("rejected");
    expect(result.resolutionClaim.selected).toBeNull();
    expect(result.resolutionClaim.selectedAssumptions).toEqual([]);

    const json = resolutionClaimToJson(result.resolutionClaim);
    const candidatesJson = json.candidates as ReadonlyArray<JsonObject>;
    expect(candidatesJson.map((item) => (item.realization as JsonObject).id)).toEqual([
      "realization.inventory.broken",
      "realization.inventory.pure",
      "realization.inventory.pure-copy",
    ]);
    const pureEntry = claimCandidate(json, "realization.inventory.pure");
    const pureCopyEntry = claimCandidate(json, "realization.inventory.pure-copy");
    expect((pureEntry.realization as JsonObject).identity).toBe(
      (pureCopyEntry.realization as JsonObject).identity,
    );
    expect(pureEntry.eligible).toBeTrue();
    expect(pureCopyEntry.eligible).toBeTrue();

    const parsed = await runCrypto(parseResolutionClaim(json));
    expect(resolutionClaimToJson(parsed)).toEqual(json);
    expect(parsed.candidates.length).toBe(3);
  });

  test("resolution_claim_v1 parser rejects each required mutation with a stable message", async () => {
    const base = await developmentClaimJson();

    await expectClaimFailure({ ...base, artifact_kind: "something_else" }, "artifact_kind");
    await expectClaimFailure({ ...base, schema_version: 2 }, "schema_version");
    await expectClaimFailure({ ...base, unexpected: true }, "unknown top-level key");

    const winnerId = "realization.inventory.pure";
    const brokenId = "realization.inventory.broken";
    const winner = claimCandidate(base, winnerId);
    const broken = claimCandidate(base, brokenId);

    // unknown candidate field
    await expectClaimFailure(
      withCandidate(base, winnerId, (candidate) => ({ ...candidate, unexpected: true })),
      "unknown key",
    );

    // empty identifier ("empty binding")
    await expectClaimFailure(
      withCandidate(base, winnerId, (candidate) => ({
        ...candidate,
        realization: { ...(candidate.realization as JsonObject), id: "" },
      })),
      "nonempty string",
    );

    // duplicate candidate ID
    await expectClaimFailure({ ...base, candidates: [winner, winner, broken] }, "duplicate");

    // duplicate reason codes within one candidate
    await expectClaimFailure(
      withCandidate(base, brokenId, (candidate) => ({
        ...candidate,
        reason_codes: ["conformance_failed", "conformance_failed"],
      })),
      "duplicate",
    );

    // evidence-plus-diagnostic (exclusivity)
    await expectClaimFailure(
      withCandidate(base, winnerId, (candidate) => ({
        ...candidate,
        producer_diagnostic: { kind: "missing_evidence", message: "synthetic" },
      })),
      "exactly one is required",
    );

    // neither payload (exclusivity)
    await expectClaimFailure(
      withCandidate(base, winnerId, (candidate) => ({ ...candidate, evidence: null })),
      "exactly one is required",
    );

    // malformed embedded evidence
    await expectClaimFailure(
      withCandidate(base, winnerId, (candidate) => ({
        ...candidate,
        evidence: { ...(candidate.evidence as JsonObject), category: "proof" },
      })),
      "category",
    );

    // eligible/reason inconsistency
    await expectClaimFailure(
      withCandidate(base, winnerId, (candidate) => ({
        ...candidate,
        reason_codes: ["conformance_failed"],
      })),
      "eligible",
    );

    // status/selected inconsistency
    await expectClaimFailure({ ...base, status: "rejected" }, "status is 'rejected'");

    // wrong selected subject
    await expectClaimFailure(
      { ...base, selected: broken.realization as JsonObject },
      "does not match",
    );

    // stale selected-assumption projection
    await expectClaimFailure({ ...base, selected_assumptions: [] }, "stale");
  });

  test("the parser rejects embedded evidence whose obligation is not the claim's required obligation", async () => {
    const base = await developmentClaimJson();
    const winner = claimCandidate(base, "realization.inventory.pure");
    expect((winner.evidence as JsonObject).obligation).toBe(base.required_obligation);

    // A foreign required obligation: the winner's evidence adjudicates
    // `obligation.inventory.conformance`, so it is not evidence about this
    // claim at all and must not ride through as if it were.
    await expectClaimFailure(
      { ...base, required_obligation: "obligation.inventory.other" },
      "carries evidence for obligation",
    );

    // No single required obligation at all admits no evidence-bearing
    // candidate, since evidence always declares one.
    await expectClaimFailure(
      { ...base, required_obligation: null },
      "but the claim requires no single obligation",
    );
  });

  test("the builder rejects embedded evidence whose obligation is not the claim's required obligation", async () => {
    const winner: ResolutionClaimCandidate = {
      realizationId: "realization.z",
      realizationIdentity: "sha256:fixture-realization-z",
      targetsTheory: true,
      realizationAssumptions: [],
      evidence: await fixtureEvidence("sha256:fixture-realization-z", "obligation.fixture.other"),
      producerDiagnostic: null,
      eligible: true,
      reasonCodes: [],
    };
    const buildInput = {
      theoryId: "theory.fixture",
      theoryIdentity: "sha256:fixture-theory",
      policy: { id: "policy.fixture" },
      candidates: [winner],
      status: "selected" as const,
      selectedRealizationId: "realization.z",
    };

    // Same well-formed candidate, only the claim's required obligation
    // differs: it builds when the two agree and fails when they do not, so
    // the rejection is about the binding and nothing else.
    const agreeing = await runCrypto(
      buildResolutionClaim({ ...buildInput, requiredObligation: "obligation.fixture.other" }),
    );
    expect(agreeing.status).toBe("selected");

    const mismatched = await Effect.runPromiseExit(
      provideCrypto(
        buildResolutionClaim({ ...buildInput, requiredObligation: "obligation.fixture.required" }),
      ),
    );
    expect(Exit.isFailure(mismatched)).toBeTrue();
    if (Exit.isFailure(mismatched)) {
      expect(String(mismatched.cause)).toContain(
        "carries evidence for obligation 'obligation.fixture.other' but the claim requires 'obligation.fixture.required'",
      );
    }

    const noObligation = await Effect.runPromiseExit(
      provideCrypto(buildResolutionClaim({ ...buildInput, requiredObligation: null })),
    );
    expect(Exit.isFailure(noObligation)).toBeTrue();
    if (Exit.isFailure(noObligation)) {
      expect(String(noObligation.cause)).toContain("no single obligation");
    }
  });

  test("a forged or copy-derived claim can neither be typed as a ResolutionClaim nor emitted through the supported API", async () => {
    const minted = (await runBun(runDemo(INVENTORY, "development"))).resolutionClaim;
    // Structurally complete: every field the interface declares, with real
    // values taken from a genuine claim. What it lacks is provenance — it
    // never passed `finalizeResolutionClaim` — and it claims a selection no
    // candidate supports.
    const forged = {
      artifactKind: minted.artifactKind,
      schemaVersion: minted.schemaVersion,
      theory: minted.theory,
      requiredObligation: minted.requiredObligation,
      policy: minted.policy,
      candidates: minted.candidates,
      status: "selected" as const,
      selected: { id: "realization.inventory.broken", identity: "sha256:forged" },
      selectedAssumptions: [],
    };

    // Compile oracle: the forged literal is not assignable to
    // `ResolutionClaim`. If the brand were dropped from the type this
    // directive would become an unused `@ts-expect-error` and
    // `bun run typecheck` would fail, so the boundary cannot silently erode.
    // @ts-expect-error a structurally forged claim is not a ResolutionClaim
    const emitForged = () => resolutionClaimToJson(forged);

    // Runtime oracle: the same forgery reaching the emitter through a cast
    // or from untyped JavaScript is rejected rather than emitted.
    expect(emitForged).toThrow(DocumentError);

    // Provenance is object identity, not a copyable property, so a spread of
    // a genuine claim — which does carry every own property including the
    // brand symbol — is still rejected. This is the route a property-based
    // witness alone would have certified.
    expect(() => resolutionClaimToJson({ ...minted, status: "rejected" })).toThrow(DocumentError);
    expect(() => resolutionClaimToJson({ ...minted })).toThrow(DocumentError);
    expect(() => resolutionClaimToJson(Object.assign({}, minted))).toThrow(DocumentError);

    // The brand is symbol-keyed, so it never leaks into the artifact.
    expect(Object.keys(resolutionClaimToJson(minted))).toEqual([
      "artifact_kind",
      "schema_version",
      "theory",
      "required_obligation",
      "policy",
      "candidates",
      "status",
      "selected",
      "selected_assumptions",
    ]);
  });

  test("a genuine claim cannot be mutated into a noncanonical or incoherent artifact after it is built", async () => {
    const minted = (await runBun(runDemo(INVENTORY, "development"))).resolutionClaim;
    const before = resolutionClaimToJson(minted);
    const winner = minted.candidates.find((candidate) => candidate.eligible)!;
    const failing = minted.candidates
      .flatMap((candidate) => (candidate.evidence === null ? [] : candidate.evidence.caseResults))
      .find((result) => !result.passed);
    expect(failing).toBeDefined();

    // Every claim-owned structure is deeply frozen over freshly copied
    // values, so post-build mutation is not merely detected at emit time —
    // it cannot happen. Test modules are ESM and therefore strict, so each
    // of these writes throws instead of silently no-op'ing.
    const mutations: ReadonlyArray<[string, () => void]> = [
      ["top-level status", () => Object.assign(minted, { status: "rejected" })],
      ["selected subject", () => Object.assign(minted.selected!, { id: "realization.forged" })],
      ["theory identity", () => Object.assign(minted.theory, { identity: "sha256:forged" })],
      ["policy identity", () => Object.assign(minted.policy, { contentIdentity: "sha256:forged" })],
      ["candidate order", () => (minted.candidates as Array<ResolutionClaimCandidate>).reverse()],
      ["candidate membership", () => (minted.candidates as Array<ResolutionClaimCandidate>).pop()],
      ["candidate eligibility", () => Object.assign(winner, { eligible: false })],
      ["reason codes", () => (winner.reasonCodes as Array<string>).push("forged_reason")],
      [
        "selected assumptions",
        () => (minted.selectedAssumptions as Array<string>).push("A forged assumption."),
      ],
      ["evidence identity", () => Object.assign(winner.evidence!, { identity: "sha256:forged" })],
      [
        "evidence obligation",
        () => Object.assign(winner.evidence!, { obligation: "obligation.x" }),
      ],
      ["evidence assumptions", () => (winner.evidence!.assumptions as Array<string>).pop()],
      ["case outcome", () => Object.assign(winner.evidence!.caseResults[0]!, { passed: false })],
      ["nested producer payload", () => Object.assign(winner.evidence!.producer, { id: "forged" })],
      ["nested failure detail", () => Object.assign(failing!.detail!, { forged: true })],
    ];
    for (const [label, mutate] of mutations) {
      expect(mutate, label).toThrow(TypeError);
    }

    // Nothing landed: the emitted artifact is byte-identical to before.
    expect(resolutionClaimToJson(minted)).toEqual(before);
  });

  test("a built claim aliases no caller structure, so mutating resolver inputs afterwards cannot change it", async () => {
    const realizationAssumptions = ["An authored assumption."];
    const evidence = await fixtureEvidence("sha256:fixture-realization-z");
    const candidate: ResolutionClaimCandidate = {
      realizationId: "realization.z",
      realizationIdentity: "sha256:fixture-realization-z",
      targetsTheory: true,
      realizationAssumptions,
      evidence,
      producerDiagnostic: null,
      eligible: true,
      reasonCodes: [],
    };
    const claim = await runCrypto(
      buildResolutionClaim({
        theoryId: "theory.fixture",
        theoryIdentity: "sha256:fixture-theory",
        requiredObligation: "obligation.inventory.conformance",
        policy: { id: "policy.fixture" },
        candidates: [candidate],
        status: "selected",
        selectedRealizationId: "realization.z",
      }),
    );
    const before = resolutionClaimToJson(claim);

    // The caller's own arrays and payloads stay mutable — the claim copied
    // them rather than freezing the caller's data out from under it — and
    // those mutations cannot reach the claim.
    realizationAssumptions.push("A late assumption.");
    (evidence.assumptions as Array<string>).push("A late evidence assumption.");
    (evidence.producer as Record<string, unknown>).id = "producer.mutated";
    expect(realizationAssumptions.length).toBe(2);

    expect(resolutionClaimToJson(claim)).toEqual(before);
  });

  test("resolution-claim.ts's transitive relative-import closure never reaches production, execution, or I/O modules", async () => {
    const entry = join(ROOT, "src", "tracer", "resolution-claim.ts");
    const closure = await transitiveRelativeImportClosure(entry);

    const forbiddenBasenames = [
      "resolver.ts",
      "demo.ts",
      "evidence.ts",
      "domain.ts",
      "operations.ts",
      "execution.ts",
      "loader.ts",
      "cli.ts",
      "main-bun.ts",
      "main-node.ts",
    ];
    const visitedBasenames = [...closure.files].map((path) => path.split("/").pop()!);
    for (const basename of forbiddenBasenames) {
      expect(visitedBasenames).not.toContain(basename);
    }

    const ALLOWED_BARE_IMPORTS = new Set(["effect"]);
    const disallowedBareImports = [...closure.bareImports].filter(
      (specifier) => !ALLOWED_BARE_IMPORTS.has(specifier),
    );
    expect(disallowedBareImports).toEqual([]);

    const combinedSource = [...closure.sources.values()].join("\n");
    for (const symbol of [
      "runConformance",
      "produceEvidence",
      "loadInventory",
      "executeScenario",
    ]) {
      expect(combinedSource).not.toContain(symbol);
    }
  });
});
