import assert from "node:assert/strict";
import test from "node:test";
import { Effect } from "effect";
import {
  decodeStructuredConcurrencyReport,
  encodeStructuredConcurrencyReport,
  traceStructuredConcurrency,
} from "../src/structured-concurrency/index.ts";

test("genuine Node compares and strictly rederives the structured-concurrency report", async () => {
  const report = await Effect.runPromise(
    traceStructuredConcurrency({
      format: "semantic.structured-concurrency-script",
      version: 1,
      root_scope: "root",
      events: [
        {
          tag: "spawn",
          task: "task",
          scope: "root",
          program: { yields: ["yield"], terminal: { tag: "succeeded" } },
        },
        { tag: "dispatch", task: "task" },
        { tag: "request_cancel", task: "task" },
        { tag: "deliver_cancel", task: "task" },
        { tag: "join", task: "task" },
        { tag: "exit_scope", scope: "root" },
      ],
    }),
  );
  const encoded = encodeStructuredConcurrencyReport(report);
  const parsed = JSON.parse(new TextDecoder().decode(encoded));
  const decoded = await Effect.runPromise(decodeStructuredConcurrencyReport(parsed));
  assert.deepEqual(encodeStructuredConcurrencyReport(decoded), encoded);
  assert.equal(decoded.comparison.canonical_equal, true);
  assert.equal(decoded.reference.tasks[0]?.outcome?.tag, "cancelled");
});
