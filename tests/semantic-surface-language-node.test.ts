import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { Effect } from "effect";
import { compileSurfaceDocument } from "../src/surface-language/index.ts";
import {
  canonicalKernelCheckObservationJson,
  canonicalKernelDocumentJson,
} from "../src/kernel-json/index.ts";

test("genuine Node compiles the selected surface tracer deterministically", async () => {
  const source = await readFile(
    new URL("../examples/surface-language/handled-fresh.semantic", import.meta.url),
    "utf8",
  );
  const compilation = Effect.runSync(compileSurfaceDocument(source));
  assert.equal(compilation.check.observation.tag, "accepted");
  assert.equal(
    canonicalKernelDocumentJson(compilation.kernel),
    '{"format":"semantic.kernel-json","kernel":"semantic.kernel-calculus/0018/v1","program":{"computation":{"argument":{"tag":"unit"},"grade":"1","label":"fresh","operation":"allocate","tag":"operation"},"label":"fresh","operation_clauses":[{"body":{"resumption_distance":0,"tag":"resume","value":{"tag":"int","value":7}},"operation":"allocate"}],"return_clause":{"body":{"grade":"1","tag":"return","value":{"distance":0,"tag":"bound-value"}}},"tag":"handle"},"signature":[{"argument_type":{"tag":"unit"},"label":"fresh","operation":"allocate","result_type":{"tag":"int"}}],"version":1}',
  );
  assert.match(canonicalKernelCheckObservationJson(compilation.check), /"tag":"accepted"/);
});
