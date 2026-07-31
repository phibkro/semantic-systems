import assert from "node:assert/strict";
import test from "node:test";
import {
  canonicalCheckReport,
  canonicalEvaluationReport,
  check,
  effectRow,
  evaluate,
  int,
  operationSignature,
  returnTerm,
} from "../src/kernel-calculus/index.ts";

const expectedCheck =
  '{"derivation":{"conclusion":"F[1] Int ; {}","path":"$","premises":[{"conclusion":"Int","path":"$.value","premises":[],"rule":"value.int"}],"rule":"computation.return"},"effects":[],"status":"accepted","type":{"grade":"1","kind":"return","value":{"kind":"int"}},"usage":[]}';
const expectedEvaluation =
  '{"status":"returned","trace":[{"path":"$","rule":"computation.return","step":0},{"path":"$","rule":"machine.return","step":1}],"value":{"kind":"int","value":23}}';

test("counterexample 18: genuine Node produces the frozen normalized observations", () => {
  const checked = check(operationSignature([]), returnTerm("1", int(23)));
  assert.equal(canonicalCheckReport(checked), expectedCheck);
  assert.equal(checked.status, "accepted");
  if (checked.status !== "accepted") return;
  assert.equal(canonicalEvaluationReport(evaluate(checked.program)), expectedEvaluation);
  assert.deepEqual(effectRow("😀", "\uE000", "ä", "z"), ["z", "ä", "\uE000", "😀"]);
});
