/** Genuine Node runtime adapter for the selected bytecode parity corpus. */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runCompiledKernelJsonBytes } from "../src/kernel-bytecode/index.ts";
import {
  encodeCanonicalKernelRunObservation,
  interpretKernelJsonBytes,
} from "../src/kernel-interpreter/index.ts";

const corpus = [
  "pure-program.kernel.json",
  "handled-program.kernel.json",
  "rejected-double-resume.kernel.json",
  "rejected-type-mismatch.kernel.json",
] as const;

test("genuine Node emits byte-identical reference and compiled observations", async () => {
  for (const name of corpus) {
    const source = new Uint8Array(
      await readFile(new URL(`../examples/kernel-json/${name}`, import.meta.url)),
    );
    const reference = encodeCanonicalKernelRunObservation(interpretKernelJsonBytes(source));
    const compiled = encodeCanonicalKernelRunObservation(runCompiledKernelJsonBytes(source));
    const expected = new Uint8Array(
      await readFile(
        new URL(
          `../examples/kernel-json/${name.replace(".kernel.json", ".kernel-run.json.golden")}`,
          import.meta.url,
        ),
      ),
    );
    assert.deepEqual(reference, expected, `${name}: reference/golden`);
    assert.deepEqual(compiled, expected, `${name}: compiled/golden`);
  }
});
