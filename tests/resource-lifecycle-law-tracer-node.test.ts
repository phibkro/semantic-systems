import assert from "node:assert/strict";
import test from "node:test";
import { Effect } from "effect";
import {
  decodeResourceLifecycleReport,
  encodeResourceLifecycleReport,
  traceResourceLifecycle,
  type ResourceLifecycleScript,
} from "../src/resource-lifecycle/index.ts";

const script: ResourceLifecycleScript = {
  format: "semantic.resource-lifecycle-script",
  version: 1,
  root_scope: "root",
  events: [
    { tag: "open_scope", scope: "child", parent: "root" },
    {
      tag: "acquire",
      attempt: "root-attempt",
      scope: "root",
      outcome: {
        tag: "succeeded",
        resource: "root-resource",
        finalizer: { tag: "succeeded" },
      },
    },
    {
      tag: "transfer",
      resource: "root-resource",
      from_scope: "root",
      to_scope: "child",
    },
    { tag: "exit_scope", scope: "root", cause: "normal" },
    { tag: "exit_scope", scope: "child", cause: "cancellation" },
    { tag: "exit_scope", scope: "root", cause: "typed-failure" },
  ],
};

test("genuine Node emits and decodes the canonical lifecycle observation", () => {
  const report = Effect.runSync(traceResourceLifecycle(script));
  const bytes = encodeResourceLifecycleReport(report);
  const decoded = Effect.runSync(decodeResourceLifecycleReport(report));

  assert.deepEqual(encodeResourceLifecycleReport(decoded), bytes);
  assert.equal(new TextDecoder().decode(bytes).endsWith("\n"), true);
  assert.deepEqual(
    report.observations
      .filter(
        (item): item is Extract<(typeof report.observations)[number], { tag: "finalization" }> =>
          item.tag === "finalization",
      )
      .map((item) => item.resource),
    ["root-resource"],
  );
  assert.deepEqual(report.laws, {
    at_most_once_finalization: true,
    singular_ownership: true,
    closed_scope_resources_finalized: true,
  });
});
