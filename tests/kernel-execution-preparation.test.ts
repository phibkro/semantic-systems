import { describe, expect, test } from "bun:test";
import { Effect } from "effect";
import { isCheckedProgram } from "../src/kernel-calculus/checker.ts";
import {
  KernelCheckRejected,
  KernelRepresentationRejected,
  prepareKernelJsonBytes,
} from "../src/kernel-execution/prepare.ts";
import { encodeCanonicalKernelRunObservation } from "../src/kernel-interpreter/index.ts";

const readBytes = (name: string): Promise<Uint8Array> =>
  Bun.file(new URL(`../examples/kernel-json/${name}`, import.meta.url)).bytes();

describe("shared kernel execution preparation", () => {
  test("accepted bytes produce genuine checked custody", async () => {
    const prepared = Effect.runSync(
      prepareKernelJsonBytes(await readBytes("pure-program.kernel.json")),
    );
    expect(isCheckedProgram(prepared.program)).toBe(true);
    expect(Object.isFrozen(prepared)).toBe(true);
  });

  test("representation and check failures stay exact observations", async () => {
    const malformed = Effect.runSync(
      Effect.flip(prepareKernelJsonBytes(new TextEncoder().encode("{"))),
    );
    expect(malformed).toBeInstanceOf(KernelRepresentationRejected);

    const rejected = Effect.runSync(
      Effect.flip(prepareKernelJsonBytes(await readBytes("rejected-double-resume.kernel.json"))),
    );
    expect(rejected).toBeInstanceOf(KernelCheckRejected);
    expect(() => encodeCanonicalKernelRunObservation(rejected.observation)).not.toThrow();
    expect(rejected.observation.observation.tag).toBe("check-rejected");
  });
});
