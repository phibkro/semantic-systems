import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  encodeCanonicalKernelRunObservation,
  interpretKernelJsonBytes,
} from "../src/kernel-interpreter/index.ts";

const corpus = [
  "pure-program.kernel.json",
  "handled-program.kernel.json",
  "sum-case.kernel.json",
  "rejected-double-resume.kernel.json",
  "rejected-type-mismatch.kernel.json",
] as const;

test("genuine Node emits the selected canonical kernel-run corpus", async () => {
  for (const name of corpus) {
    const source = new Uint8Array(
      await readFile(new URL(`../examples/kernel-json/${name}`, import.meta.url)),
    );
    const actual = new TextDecoder().decode(
      encodeCanonicalKernelRunObservation(interpretKernelJsonBytes(source)),
    );
    const expected = await readFile(
      new URL(
        `../examples/kernel-json/${name.replace(".kernel.json", ".kernel-run.json.golden")}`,
        import.meta.url,
      ),
      "utf8",
    );
    assert.equal(actual, expected);
  }
});
