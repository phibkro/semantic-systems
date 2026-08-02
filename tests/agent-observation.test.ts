import { BunCrypto } from "@effect/platform-bun";
import { Crypto, Effect } from "effect";
import { describe, expect, test } from "bun:test";
import { analyzeAgentObservationCapture } from "../src/agent-observation/index.ts";
import { AgentObservationBounds } from "../src/agent-observation/schema.ts";

const head = "a".repeat(40);

const portfolio = {
  schema_version: "pbk.portfolio-public/v1",
  metadata: {
    commit: head,
    digest: "b".repeat(64),
    observed_at: "2026-08-02T09:00:00Z",
    freshness_seconds: 300,
  },
  document: {
    schema_version: "pbk.portfolio/v1",
    studio: { id: "pbk", name: "PBK", summary: "PBK Technologies" },
    projects: [
      {
        id: "pbk.semantic",
        name: "Semantic Systems",
        summary: "Semantic Systems",
        repository_url: "https://example.com/semantic",
        head,
        observed_at: "2026-08-02T09:00:00Z",
        status: "active",
        preview_url: null,
      },
    ],
    work: [
      {
        id: "work.observation",
        project_id: "pbk.semantic",
        kind: "feature",
        title: "Agent observation",
        summary: "Correlate one bounded capture",
        status: "active",
        definition_of_done: ["The report is deterministic"],
        attributes: {},
      },
    ],
    relations: [],
    labels: [],
    memberships: [],
    views: [],
    artifacts: [
      {
        id: "artifact.observation",
        work_id: "work.observation",
        kind: "evidence",
        title: "Observation report",
        href: "https://example.com/observation",
        revision: head,
      },
    ],
    priorities: [],
    receipts: [],
    snapshots: [],
  },
} as const;

const toHex = (bytes: Uint8Array): string =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");

const digest = (value: string) =>
  Effect.gen(function* () {
    const crypto = yield* Crypto.Crypto;
    const bytes = yield* crypto.digest("SHA-256", new TextEncoder().encode(value));
    return `sha256:${toHex(bytes)}`;
  });

const analyze = async (input: unknown) =>
  Effect.runPromise(analyzeAgentObservationCapture(input).pipe(Effect.provide(BunCrypto.layer)));

const langfuseRows = () =>
  [
    {
      id: "observation-root",
      traceId: "trace-langfuse",
      projectId: "langfuse-project",
      parentObservationId: null,
      isRootObservation: true,
      type: "SPAN",
      startTime: "2026-08-02T10:00:00.000Z",
      endTime: "2026-08-02T10:00:01.000Z",
      name: "bounded-agent-run",
      level: "DEFAULT",
      statusMessage: "",
      metadata: {
        "pbk.project.id": "pbk.semantic",
        "semantic.work.id": "work.observation",
        "semantic.attempt.id": "attempt.42",
        "semantic.project.revision": head,
        "semantic.evidence.refs": ["artifact.observation"],
      },
    },
    {
      id: "observation-child",
      traceId: "trace-langfuse",
      projectId: "langfuse-project",
      parentObservationId: "observation-root",
      isRootObservation: false,
      type: "GENERATION",
      startTime: "2026-08-02T10:00:00.100Z",
      endTime: "2026-08-02T10:00:00.900Z",
      name: "model-call",
      level: "DEFAULT",
      statusMessage: "",
      metadata: {},
    },
  ] as const;

const langfuseInput = async (rows: ReadonlyArray<unknown> = langfuseRows()) => {
  const capture_bytes = JSON.stringify({ data: rows, meta: { cursor: null } });
  return {
    format: "semantic.agent-observation-capture/v1",
    vendor: "langfuse",
    vendor_project_id: "langfuse-project",
    capture_bytes,
    source_digest: await Effect.runPromise(
      digest(capture_bytes).pipe(Effect.provide(BunCrypto.layer)),
    ),
    captured_at: "2026-08-02T10:05:00.000Z",
    interval: {
      start: "2026-08-02T10:00:00.000Z",
      end: "2026-08-02T11:00:00.000Z",
    },
    row_limit: 10,
    complete: true,
    truncated: false,
    portfolio,
  } as const;
};

const clickstackRows = () =>
  [
    {
      TraceId: "0123456789abcdef0123456789abcdef",
      SpanId: "1111111111111111",
      ParentSpanId: "",
      Timestamp: "2026-08-02T10:00:00.000Z",
      Duration: 1_000_000_000,
      SpanName: "bounded-agent-run",
      ServiceName: "semantic-agent",
      StatusCode: "STATUS_CODE_UNSET",
      SpanAttributes: {
        "pbk.project.id": "pbk.semantic",
        "semantic.work.id": "work.observation",
        "semantic.attempt.id": "attempt.42",
        "semantic.project.revision": head,
        "semantic.evidence.refs": '["artifact.observation"]',
      },
      ResourceAttributes: {},
    },
    {
      TraceId: "0123456789abcdef0123456789abcdef",
      SpanId: "2222222222222222",
      ParentSpanId: "1111111111111111",
      Timestamp: "2026-08-02T10:00:00.100Z",
      Duration: 800_000_000,
      SpanName: "model-call",
      ServiceName: "semantic-agent",
      StatusCode: "STATUS_CODE_OK",
      SpanAttributes: {},
      ResourceAttributes: {},
    },
  ] as const;

const clickstackInput = async (rows: ReadonlyArray<unknown> = clickstackRows()) => {
  const capture_bytes = `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`;
  return {
    format: "semantic.agent-observation-capture/v1",
    vendor: "clickstack",
    vendor_project_id: "clickstack-dataset",
    capture_bytes,
    source_digest: await Effect.runPromise(
      digest(capture_bytes).pipe(Effect.provide(BunCrypto.layer)),
    ),
    captured_at: "2026-08-02T10:05:00.000Z",
    interval: {
      start: "2026-08-02T10:00:00.000Z",
      end: "2026-08-02T11:00:00.000Z",
    },
    row_limit: 10,
    complete: true,
    truncated: false,
    portfolio,
  } as const;
};

describe("agent observation correlation", () => {
  test("correlates one complete Langfuse trace without granting attempt authority", async () => {
    const artifact = await analyze(await langfuseInput());
    const root = artifact.report.trace.roots[0]!;

    expect(artifact.report.source.vendor).toBe("langfuse");
    expect(artifact.report.source.trace_id).toBe("trace-langfuse");
    expect(artifact.report.capture_state).toBe("complete");
    expect(root.observation_id).toBe("observation-root");
    expect(root.correlation.project).toEqual({ value: "pbk.semantic", state: "matched" });
    expect(root.correlation.work).toEqual({ value: "work.observation", state: "matched" });
    expect(root.correlation.attempt).toEqual({ value: "attempt.42", state: "observed_only" });
    expect(root.correlation.revision).toEqual({ value: head, state: "matched" });
    expect(root.correlation.evidence).toEqual([
      { value: "artifact.observation", state: "matched" },
    ]);
    expect(root.children.map(({ observation_id }) => observation_id)).toEqual([
      "observation-child",
    ]);

    const repeated = await analyze(await langfuseInput());
    const permuted = await analyze(await langfuseInput([...langfuseRows()].reverse()));
    expect(repeated.canonical_json).toBe(artifact.canonical_json);
    expect(permuted.report.trace).toEqual(artifact.report.trace);
  });

  test("normalizes ClickStack spans through the same correlation semantics", async () => {
    const artifact = await analyze(await clickstackInput());
    const root = artifact.report.trace.roots[0]!;

    expect(artifact.report.source.vendor).toBe("clickstack");
    expect(artifact.report.source.vendor_project_id).toBe("clickstack-dataset");
    expect(artifact.report.source.trace_id).toBe("0123456789abcdef0123456789abcdef");
    expect(root.observation_id).toBe("1111111111111111");
    expect(root.correlation.project).toEqual({ value: "pbk.semantic", state: "matched" });
    expect(root.correlation.work).toEqual({ value: "work.observation", state: "matched" });
    expect(root.correlation.attempt).toEqual({ value: "attempt.42", state: "observed_only" });
    expect(root.correlation.evidence).toEqual([
      { value: "artifact.observation", state: "matched" },
    ]);

    const langfuse = await analyze(await langfuseInput());
    expect(root.correlation).toEqual(langfuse.report.trace.roots[0]!.correlation);
    expect(root.observation_id).not.toBe(langfuse.report.trace.roots[0]!.observation_id);

    const [clickRoot, clickChild] = clickstackRows();
    const bareReference = await analyze(
      await clickstackInput([
        {
          ...clickRoot,
          SpanAttributes: {
            ...clickRoot.SpanAttributes,
            "semantic.evidence.refs": "artifact.observation",
          },
        },
        clickChild,
      ]),
    );
    expect(bareReference.report.trace.roots[0]!.correlation.evidence).toEqual([
      { value: "artifact.observation", state: "matched" },
    ]);
  });

  test("keeps an explicitly incomplete Langfuse forest inspectable", async () => {
    const orphan = {
      ...langfuseRows()[1],
      id: "observation-orphan",
      parentObservationId: "missing-parent",
      startTime: "2026-08-02T10:00:00.200Z",
    };
    const rows = [...langfuseRows(), orphan];
    const capture_bytes = JSON.stringify({ data: rows, meta: { cursor: "next-page" } });
    const base = await langfuseInput(rows);
    const artifact = await analyze({
      ...base,
      capture_bytes,
      source_digest: await Effect.runPromise(
        digest(capture_bytes).pipe(Effect.provide(BunCrypto.layer)),
      ),
      complete: false,
      truncated: true,
    });

    expect(artifact.report.capture_state).toBe("incomplete");
    expect(artifact.report.trace.roots.map(({ observation_id }) => observation_id)).toEqual([
      "observation-root",
      "observation-orphan",
    ]);
    expect(artifact.report.diagnostics.map(({ code }) => code).sort()).toEqual([
      "capture.cursor-remaining",
      "capture.incomplete",
      "capture.truncated",
      "trace.orphan",
    ]);
  });

  test("accepts a single-row Langfuse observations_v2 JSONL export", async () => {
    const rows = [langfuseRows()[0]!];
    const capture_bytes = `${JSON.stringify(rows[0])}\n`;
    const base = await langfuseInput(rows);
    const artifact = await analyze({
      ...base,
      capture_bytes,
      source_digest: await Effect.runPromise(
        digest(capture_bytes).pipe(Effect.provide(BunCrypto.layer)),
      ),
    });

    expect(artifact.report.source.vendor).toBe("langfuse");
    expect(artifact.report.source.observed_rows).toBe(1);
    expect(artifact.report.capture_state).toBe("complete");
  });

  test("orders mixed-precision timestamps chronologically before span identity", async () => {
    const [root, child] = langfuseRows();
    const rows = [
      root,
      {
        ...child,
        id: "observation-earlier",
        startTime: "2026-08-02T10:00:00Z",
        endTime: "2026-08-02T10:00:00.100Z",
      },
      {
        ...child,
        id: "observation-later",
        startTime: "2026-08-02T10:00:00.500Z",
        endTime: "2026-08-02T10:00:00.900Z",
      },
    ];
    const artifact = await analyze(await langfuseInput(rows));

    expect(
      artifact.report.trace.roots[0]!.children.map(({ observation_id }) => observation_id),
    ).toEqual(["observation-earlier", "observation-later"]);
  });

  test("rejects Langfuse metadata beyond the frozen nesting bound", async () => {
    let nested: unknown = "leaf";
    for (let depth = 0; depth < 9; depth += 1) nested = { child: nested };
    const [root, child] = langfuseRows();
    const rows = [{ ...root, metadata: { ...root.metadata, unknown: nested } }, child];
    const capture_bytes = JSON.stringify({ data: rows, meta: { cursor: null } });
    const base = await langfuseInput(rows);

    await expect(
      analyze({
        ...base,
        capture_bytes,
        source_digest: await Effect.runPromise(
          digest(capture_bytes).pipe(Effect.provide(BunCrypto.layer)),
        ),
      }),
    ).rejects.toMatchObject({
      code: "bounds.metadata-depth-exceeded",
    });
  });

  test("rejects false completeness, row overflow, digest drift, and unknown envelope fields", async () => {
    const rows = langfuseRows();
    const cursorBytes = JSON.stringify({ data: rows, meta: { cursor: "next-page" } });
    const cursorBase = await langfuseInput(rows);
    await expect(
      analyze({
        ...cursorBase,
        capture_bytes: cursorBytes,
        source_digest: await Effect.runPromise(
          digest(cursorBytes).pipe(Effect.provide(BunCrypto.layer)),
        ),
      }),
    ).rejects.toMatchObject({ code: "capture.false-completeness" });

    const clickstack = await clickstackInput();
    await expect(analyze({ ...clickstack, truncated: true })).rejects.toMatchObject({
      code: "capture.false-completeness",
    });
    await expect(analyze({ ...(await langfuseInput()), row_limit: 1 })).rejects.toMatchObject({
      code: "bounds.rows-exceeded",
    });
    await expect(
      analyze({ ...(await langfuseInput()), source_digest: `sha256:${"0".repeat(64)}` }),
    ).rejects.toMatchObject({ code: "digest.mismatch" });
    await expect(analyze({ ...(await langfuseInput()), unexpected: true })).rejects.toMatchObject({
      code: "input.invalid",
    });
  });

  test("rejects invalid UTF-8 text custody and impossible calendar timestamps", async () => {
    const invalidUnicode = "\ud800";
    await expect(
      analyze({
        ...(await langfuseInput()),
        capture_bytes: invalidUnicode,
        source_digest: await Effect.runPromise(
          digest(invalidUnicode).pipe(Effect.provide(BunCrypto.layer)),
        ),
      }),
    ).rejects.toMatchObject({ code: "capture.invalid-utf8" });

    await expect(
      analyze({
        ...(await langfuseInput()),
        captured_at: "2026-02-31T10:05:00.000Z",
      }),
    ).rejects.toMatchObject({ code: "time.invalid" });

    const [root, child] = langfuseRows();
    await expect(
      analyze(await langfuseInput([{ ...root, startTime: "2026-02-31T10:00:00.000Z" }, child])),
    ).rejects.toMatchObject({ code: "time.invalid" });
  });

  test("rejects unsafe scalar bounds, excessive JSON nesting, and over-deep traces", async () => {
    const [clickRoot] = clickstackRows();
    await expect(
      analyze(await clickstackInput([{ ...clickRoot, Duration: Number.MAX_SAFE_INTEGER + 1 }])),
    ).rejects.toMatchObject({ code: "capture.invalid-clickstack" });
    await expect(
      analyze(await clickstackInput([{ ...clickRoot, SpanId: "0000000000000000" }])),
    ).rejects.toMatchObject({ code: "capture.invalid-clickstack" });
    await expect(
      analyze(await clickstackInput([{ ...clickRoot, Duration: "18446744073709551616" }])),
    ).rejects.toMatchObject({ code: "bounds.duration-too-large" });

    const nestedBytes = `${"[".repeat(17)}0${"]".repeat(17)}`;
    await expect(
      analyze({
        ...(await langfuseInput()),
        capture_bytes: nestedBytes,
        source_digest: await Effect.runPromise(
          digest(nestedBytes).pipe(Effect.provide(BunCrypto.layer)),
        ),
      }),
    ).rejects.toMatchObject({ code: "bounds.json-depth-exceeded" });

    const broadBytes = `[${"0,".repeat(AgentObservationBounds.maximum_json_structural_tokens)}0]`;
    await expect(
      analyze({
        ...(await langfuseInput()),
        capture_bytes: broadBytes,
        source_digest: await Effect.runPromise(
          digest(broadBytes).pipe(Effect.provide(BunCrypto.layer)),
        ),
      }),
    ).rejects.toMatchObject({ code: "bounds.json-structural-tokens-exceeded" });

    const root = langfuseRows()[0]!;
    const observationId = (index: number) => index.toString(16).padStart(32, "0");
    const deepRows = Array.from({ length: 129 }, (_, index) => ({
      ...root,
      id: observationId(index + 1),
      parentObservationId: index === 0 ? null : observationId(index),
      isRootObservation: index === 0,
    }));
    await expect(
      analyze({ ...(await langfuseInput(deepRows)), row_limit: deepRows.length }),
    ).rejects.toMatchObject({ code: "bounds.trace-depth-exceeded" });
  });

  test("fails fast on NDJSON row and Langfuse attribute counts", async () => {
    const [clickRoot] = clickstackRows();
    const excessRows = Array.from({ length: 11 }, (_, index) => ({
      ...clickRoot,
      SpanId: (index + 1).toString(16).padStart(16, "0"),
    }));
    await expect(analyze(await clickstackInput(excessRows))).rejects.toMatchObject({
      code: "bounds.rows-exceeded",
    });

    const root = langfuseRows()[0]!;
    const excessMetadata = Object.fromEntries(
      Array.from({ length: 65 }, (_, index) => [`attribute-${index}`, index]),
    );
    await expect(
      analyze(await langfuseInput([{ ...root, metadata: excessMetadata }])),
    ).rejects.toMatchObject({ code: "bounds.attribute-count-exceeded" });
  });

  test("compares capture intervals at the timestamp schema's nanosecond precision", async () => {
    const root = langfuseRows()[0]!;
    await expect(
      analyze({
        ...(await langfuseInput([
          {
            ...root,
            startTime: "2026-08-02T10:00:00.000000000Z",
            endTime: "2026-08-02T10:00:00.100000000Z",
          },
        ])),
        interval: {
          start: "2026-08-02T10:00:00.000000001Z",
          end: "2026-08-02T11:00:00.000000000Z",
        },
      }),
    ).rejects.toMatchObject({ code: "bounds.row-outside-interval" });
  });

  test("rejects missing roots declared complete and invalid ClickStack semantic values", async () => {
    const orphanRows = [{ ...langfuseRows()[1]!, parentObservationId: "missing-parent" }];
    await expect(analyze(await langfuseInput(orphanRows))).rejects.toMatchObject({
      code: "capture.false-completeness",
    });

    const [clickRoot, clickChild] = clickstackRows();
    await expect(
      analyze(
        await clickstackInput([
          {
            ...clickRoot,
            SpanAttributes: { ...clickRoot.SpanAttributes, "pbk.project.id": "" },
          },
          clickChild,
        ]),
      ),
    ).rejects.toMatchObject({ code: "capture.invalid-semantic-attribute" });

    const excessiveEvidence = JSON.stringify(
      Array.from(
        { length: 65 },
        (_, index) => `artifact.observation.${index.toString().padStart(2, "0")}`,
      ),
    );
    await expect(
      analyze(
        await clickstackInput([
          {
            ...clickRoot,
            SpanAttributes: {
              ...clickRoot.SpanAttributes,
              "semantic.evidence.refs": excessiveEvidence,
            },
          },
          clickChild,
        ]),
      ),
    ).rejects.toMatchObject({ code: "capture.invalid-semantic-attribute" });
  });

  test("reports unknown semantic references without inventing authority", async () => {
    const [root, child] = langfuseRows();
    const rows = [
      {
        ...root,
        metadata: {
          ...root.metadata,
          "pbk.project.id": "pbk.unknown",
          "semantic.work.id": "work.unknown",
          "semantic.project.revision": "f".repeat(40),
          "semantic.evidence.refs": ["artifact.unknown"],
        },
      },
      child,
    ];
    const artifact = await analyze(await langfuseInput(rows));
    const correlation = artifact.report.trace.roots[0]!.correlation;

    expect(correlation.project.state).toBe("unknown_project");
    expect(correlation.work.state).toBe("unknown_work");
    expect(correlation.revision.state).toBe("revision_mismatch");
    expect(correlation.evidence).toEqual([
      { value: "artifact.unknown", state: "invalid_reference" },
    ]);
    expect(correlation.attempt.state).toBe("observed_only");
  });

  test("rejects cyclic trace topology and conflicting ClickStack bindings", async () => {
    const [first, second] = langfuseRows();
    const cyclicRows = [
      { ...first, parentObservationId: second.id, isRootObservation: false },
      { ...second, parentObservationId: first.id },
    ];
    const cyclicBytes = JSON.stringify({ data: cyclicRows, meta: { cursor: null } });
    const cyclic = await langfuseInput(cyclicRows);
    await expect(
      analyze({
        ...cyclic,
        capture_bytes: cyclicBytes,
        source_digest: await Effect.runPromise(
          digest(cyclicBytes).pipe(Effect.provide(BunCrypto.layer)),
        ),
        complete: false,
      }),
    ).rejects.toMatchObject({ code: "trace.cycle" });

    const [clickRoot, clickChild] = clickstackRows();
    const conflictingRows = [
      {
        ...clickRoot,
        ResourceAttributes: { "pbk.project.id": "pbk.other" },
      },
      clickChild,
    ];
    await expect(analyze(await clickstackInput(conflictingRows))).rejects.toMatchObject({
      code: "capture.attribute-conflict",
    });
  });
});
