import assert from "node:assert/strict";
import test from "node:test";
import { Effect } from "effect";
import {
  decodeResourceLifecycleEffectProjectionReport,
  encodeResourceLifecycleEffectProjectionReport,
  projectResourceLifecycleEffects,
} from "../src/resource-lifecycle-projection/index.ts";

test("genuine Node replays and strictly decodes the affine cleanup projection", () => {
  const report = Effect.runSync(
    projectResourceLifecycleEffects({
      format: "semantic.resource-lifecycle-script",
      version: 1,
      root_scope: "root",
      events: [
        {
          tag: "acquire",
          attempt: "attempt",
          scope: "root",
          outcome: { tag: "succeeded", resource: "resource", finalizer: { tag: "succeeded" } },
        },
        { tag: "exit_scope", scope: "root", cause: "normal" },
      ],
    }),
  );
  const bytes = encodeResourceLifecycleEffectProjectionReport(report);
  const decoded = Effect.runSync(decodeResourceLifecycleEffectProjectionReport(report));
  assert.deepEqual(encodeResourceLifecycleEffectProjectionReport(decoded), bytes);
  assert.equal(report.cleanup_requests[0]?.binder, "cleanup_e0_m0");
  assert.deepEqual(report.reference, report.compiled);
});
