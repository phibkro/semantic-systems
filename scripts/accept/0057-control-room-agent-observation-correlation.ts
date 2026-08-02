#!/usr/bin/env bun
import { BunCrypto, BunFileSystem, BunPath } from "@effect/platform-bun";
import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { Console, Crypto, Data, Effect } from "effect";
import { analyzeAgentObservationCapture } from "../../src/agent-observation/index.ts";
import {
  AgentObservationBounds,
  type ObservationCaptureInput,
} from "../../src/agent-observation/schema.ts";
import { buildPublicPortfolioArtifact, loadPortfolio } from "../../src/portfolio-model/index.ts";
import { stringifyCanonicalJson } from "../../src/references/canonical-json.ts";
import { runCommand, runMain } from "../lib/command.ts";

class AcceptanceFailure extends Data.TaggedError("AcceptanceFailure")<{
  readonly message: string;
}> {}

const root = resolve(import.meta.dirname, "../..");
const langfusePath = resolve(root, "examples/agent-observation/langfuse.json");
const clickstackPath = resolve(root, "examples/agent-observation/clickstack.ndjson");

const ensure = (condition: boolean, message: string): Effect.Effect<void, AcceptanceFailure> =>
  condition ? Effect.void : Effect.fail(new AcceptanceFailure({ message }));

const readText = (path: string, maximumBytes?: number): Effect.Effect<string, AcceptanceFailure> =>
  Effect.tryPromise({
    try: async () => {
      if (maximumBytes !== undefined && (await stat(path)).size > maximumBytes) {
        throw new Error(`${path} exceeds ${maximumBytes} bytes`);
      }
      return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
        await readFile(path),
      );
    },
    catch: (cause) =>
      new AcceptanceFailure({ message: `cannot read UTF-8 ${path}: ${String(cause)}` }),
  });

const parseJson = (source: string, label: string): Effect.Effect<unknown, AcceptanceFailure> =>
  Effect.try({
    try: () => JSON.parse(source) as unknown,
    catch: (cause) => new AcceptanceFailure({ message: `cannot parse ${label}: ${String(cause)}` }),
  });

const digest = (source: string) =>
  Effect.gen(function* () {
    const crypto = yield* Crypto.Crypto;
    const bytes = yield* crypto.digest("SHA-256", new TextEncoder().encode(source));
    return `sha256:${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
  });

const expectCode = (
  effect: Effect.Effect<unknown, { readonly code: string }, Crypto.Crypto>,
  code: string,
) =>
  effect.pipe(
    Effect.match({
      onFailure: (error) => error.code,
      onSuccess: () => "accepted",
    }),
    Effect.flatMap((actual) => ensure(actual === code, `expected ${code}, received ${actual}`)),
  );

const program = Effect.gen(function* () {
  const [langfuseBytes, clickstackBytes] = yield* Effect.all([
    readText(langfusePath, AgentObservationBounds.maximum_capture_bytes),
    readText(clickstackPath, AgentObservationBounds.maximum_capture_bytes),
  ]);
  const portfolioDocument = yield* loadPortfolio(root).pipe(
    Effect.mapError(
      (cause) => new AcceptanceFailure({ message: `cannot load portfolio: ${cause.message}` }),
    ),
  );
  const portfolio = (yield* buildPublicPortfolioArtifact(portfolioDocument, {
    commit: "0".repeat(40),
    observed_at: "2026-08-02T10:00:00Z",
    freshness_seconds: 86_400,
  }).pipe(
    Effect.mapError(
      (cause) =>
        new AcceptanceFailure({ message: `cannot build portfolio fixture: ${cause.message}` }),
    ),
  )).snapshot;

  const makeInput = function* (
    vendor: "langfuse" | "clickstack",
    capture_bytes: string,
    overrides: Partial<ObservationCaptureInput> = {},
  ) {
    return {
      format: "semantic.agent-observation-capture/v1",
      vendor,
      vendor_project_id: vendor === "langfuse" ? "langfuse-project" : "clickstack-dataset",
      capture_bytes,
      source_digest: yield* digest(capture_bytes),
      captured_at: "2026-08-02T10:05:00.000Z",
      interval: {
        start: "2026-08-02T10:00:00.000Z",
        end: "2026-08-02T11:00:00.000Z",
      },
      row_limit: 10,
      complete: true,
      truncated: false,
      portfolio,
      ...overrides,
    } as const;
  };

  const langfuseInput = yield* Effect.gen(() => makeInput("langfuse", langfuseBytes));
  const clickstackInput = yield* Effect.gen(() => makeInput("clickstack", clickstackBytes));
  const langfuse = yield* analyzeAgentObservationCapture(langfuseInput);
  const repeated = yield* analyzeAgentObservationCapture(langfuseInput);
  const clickstack = yield* analyzeAgentObservationCapture(clickstackInput);
  yield* ensure(
    langfuse.canonical_json === repeated.canonical_json,
    "same input changed report bytes",
  );
  yield* ensure(langfuse.report.capture_state === "complete", "Langfuse capture is not complete");
  yield* ensure(
    clickstack.report.capture_state === "complete",
    "ClickStack capture is not complete",
  );
  yield* ensure(
    langfuse.report.trace.roots[0]?.correlation.project.state === "matched" &&
      langfuse.report.trace.roots[0]?.correlation.work.state === "matched",
    "Langfuse fixture did not match portfolio identities",
  );
  yield* ensure(
    stringifyCanonicalJson(langfuse.report.trace.roots[0]!.correlation) ===
      stringifyCanonicalJson(clickstack.report.trace.roots[0]!.correlation),
    "vendor fixtures did not preserve equal PBK correlations",
  );

  const parsedLangfuse = (yield* parseJson(langfuseBytes, "Langfuse fixture")) as {
    readonly data: ReadonlyArray<unknown>;
    readonly meta: { readonly cursor: string | null };
  };
  const permutedBytes = JSON.stringify({
    data: [...parsedLangfuse.data].reverse(),
    meta: parsedLangfuse.meta,
  });
  const permutedInput = yield* Effect.gen(() => makeInput("langfuse", permutedBytes));
  const permuted = yield* analyzeAgentObservationCapture(permutedInput);
  yield* ensure(
    stringifyCanonicalJson(permuted.report.trace) === stringifyCanonicalJson(langfuse.report.trace),
    "row permutation changed normalized trace",
  );
  yield* ensure(
    permuted.report.source.source_digest !== langfuse.report.source.source_digest,
    "row permutation did not preserve distinct source identity",
  );

  const orphanBytes = JSON.stringify({ data: [parsedLangfuse.data[1]], meta: { cursor: null } });
  const completeOrphanInput = yield* Effect.gen(() => makeInput("langfuse", orphanBytes));
  yield* expectCode(
    analyzeAgentObservationCapture(completeOrphanInput),
    "capture.false-completeness",
  );
  const orphanInput = yield* Effect.gen(() =>
    makeInput("langfuse", orphanBytes, { complete: false }),
  );
  const orphan = yield* analyzeAgentObservationCapture(orphanInput);
  yield* ensure(
    orphan.report.capture_state === "incomplete" &&
      orphan.report.diagnostics.some(({ code }) => code === "trace.orphan"),
    "explicit incomplete capture did not preserve its orphan",
  );

  const cursorBytes = JSON.stringify({ data: parsedLangfuse.data, meta: { cursor: "next-page" } });
  const cursorInput = yield* Effect.gen(() => makeInput("langfuse", cursorBytes));
  yield* expectCode(analyzeAgentObservationCapture(cursorInput), "capture.false-completeness");
  const mismatchedTraceBytes = JSON.stringify({
    data: parsedLangfuse.data.map((row, index) =>
      index === 0
        ? row
        : Object.assign({}, row as Readonly<Record<string, unknown>>, {
            traceId: "trace-other",
          }),
    ),
    meta: { cursor: null },
  });
  const mismatchedTraceInput = yield* Effect.gen(() => makeInput("langfuse", mismatchedTraceBytes));
  yield* expectCode(analyzeAgentObservationCapture(mismatchedTraceInput), "capture.trace-mismatch");
  const mismatchedProjectBytes = JSON.stringify({
    data: parsedLangfuse.data.map((row, index) =>
      index === 0
        ? Object.assign({}, row as Readonly<Record<string, unknown>>, {
            projectId: "other-project",
          })
        : row,
    ),
    meta: { cursor: null },
  });
  const mismatchedProjectInput = yield* Effect.gen(() =>
    makeInput("langfuse", mismatchedProjectBytes),
  );
  yield* expectCode(
    analyzeAgentObservationCapture(mismatchedProjectInput),
    "capture.vendor-project-mismatch",
  );
  yield* expectCode(
    analyzeAgentObservationCapture({ ...clickstackInput, truncated: true }),
    "capture.false-completeness",
  );
  yield* expectCode(
    analyzeAgentObservationCapture({ ...langfuseInput, row_limit: 1 }),
    "bounds.rows-exceeded",
  );
  yield* expectCode(
    analyzeAgentObservationCapture({
      ...langfuseInput,
      source_digest: `sha256:${"0".repeat(64)}`,
    }),
    "digest.mismatch",
  );

  for (const command of [
    ["bun", "test", "tests/agent-observation.test.ts"],
    ["bun", "run", "--cwd", "apps/control-room", "test", "--", "src/App.vitest.tsx"],
    ["bun", "run", "typecheck"],
    ["bun", "run", "semproj", "--", "validate"],
    ["bun", "run", "semproj", "--", "generate", "--check"],
  ] as const) {
    yield* runCommand(command, { cwd: root });
  }

  yield* Console.log(
    stringifyCanonicalJson({
      format: "semantic.agent-observation-acceptance/v1",
      capture_states: {
        langfuse: langfuse.report.capture_state,
        clickstack: clickstack.report.capture_state,
        incomplete_langfuse: orphan.report.capture_state,
      },
      source_digests: {
        langfuse: langfuse.report.source.source_digest,
        clickstack: clickstack.report.source.source_digest,
      },
      bounds: AgentObservationBounds,
      unsupported_claims: langfuse.report.unsupported_claims,
      checks_not_run: [
        "live vendor API request",
        "external deployment observation",
        "trace causality or evidence authenticity proof",
      ],
    }),
  );
});

runMain(
  "accept/0057",
  program.pipe(Effect.provide([BunFileSystem.layer, BunPath.layer, BunCrypto.layer])),
);
