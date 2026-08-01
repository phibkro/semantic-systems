#!/usr/bin/env bun
import { resolve } from "node:path";
import { Data, Effect } from "effect";
import { runCommand, runMain } from "../lib/command.ts";

class AcceptanceFailure extends Data.TaggedError("AcceptanceFailure")<{
  readonly message: string;
}> {}

const root = resolve(import.meta.dirname, "../..");
const nodeExecutable = process.env.SEMANTIC_NODE_BIN ?? "node";
const productionSources = [
  "src/kernel-bytecode/differential.ts",
  "src/language-build/reachability.ts",
  "src/language-build/reproducible-action.ts",
  "src/language-build/runtime-closure.ts",
  "src/normalized-core/identity.ts",
  "src/portfolio-model/public-export.ts",
  "src/project-model/public-export.ts",
  "src/project-model/relational-facts.ts",
  "src/references/catalog.ts",
  "src/references/git.ts",
  "src/references/verify.ts",
  "src/tracer/canonical.ts",
] as const;
const required = [
  "design-specs/0050-effect-encoding-hex-consolidation.md",
  "plans/completed/0050-effect-encoding-hex-consolidation.md",
  "model/work/effect-encoding-hex-consolidation.json",
  "tests/effect-encoding-hex.test.ts",
  ...productionSources,
] as const;

const nodeOracleProbe = `
import { Encoding } from "effect";
const digits = "0123456789abcdef";
const oracle = (bytes) => {
  let output = "";
  for (const byte of bytes) output += digits[Math.floor(byte / 16)] + digits[byte % 16];
  return output;
};
for (let byte = 0; byte <= 0xff; byte += 1) {
  const input = Uint8Array.of(byte);
  if (Encoding.encodeHex(input) !== oracle(input)) throw new Error("Node hex mismatch at " + byte);
}
for (const input of [new Uint8Array(), Uint8Array.of(0, 1, 15, 16, 127, 128, 254, 255)]) {
  if (Encoding.encodeHex(input) !== oracle(input)) throw new Error("Node hex vector mismatch");
}
`;

const program = Effect.gen(function* () {
  for (const relativePath of required) {
    const file = Bun.file(resolve(root, relativePath));
    if (!(yield* Effect.promise(() => file.exists()))) {
      return yield* new AcceptanceFailure({ message: `missing 0050 artifact ${relativePath}` });
    }
  }

  for (const relativePath of productionSources) {
    const source = yield* Effect.promise(() => Bun.file(resolve(root, relativePath)).text());
    if (!source.includes("Encoding.encodeHex")) {
      return yield* new AcceptanceFailure({
        message: `${relativePath} does not delegate hexadecimal encoding to Effect`,
      });
    }
    if (/toString\(16\).*padStart\(2,\s*["']0["']\)/s.test(source)) {
      return yield* new AcceptanceFailure({
        message: `${relativePath} retains a hand-written byte-to-hex implementation`,
      });
    }
  }

  yield* runCommand(["bun", "test", "tests/effect-encoding-hex.test.ts"], { cwd: root });
  yield* runCommand([nodeExecutable, "--input-type=module", "--eval", nodeOracleProbe], {
    cwd: root,
  });
  yield* runCommand(
    [
      "bun",
      "test",
      "tests/kernel-bytecode-differential.test.ts",
      "tests/normalized-core-format.test.ts",
      "tests/language-build-reachability.test.ts",
      "tests/language-build-runtime-closure.test.ts",
      "tests/language-build-reproducible-action.test.ts",
      "tests/pbk-portfolio-model.test.ts",
      "tests/public-export.test.ts",
      "tests/project-relational-facts.test.ts",
      "tests/reference-custody.test.ts",
      "tests/inventory-tracer.test.ts",
    ],
    { cwd: root },
  );
  yield* runCommand(
    [
      nodeExecutable,
      "--test",
      "tests/normalized-core-node.test.ts",
      "tests/language-build-reachability-node.test.ts",
      "tests/language-build-runtime-closure-node.test.ts",
      "tests/language-build-reproducible-action-node.test.ts",
      "tests/project-relational-facts-node.test.ts",
    ],
    { cwd: root },
  );
  yield* runCommand(["bun", "run", "typecheck"], { cwd: root });
  yield* runCommand(["bun", "run", "lint"], { cwd: root });
  yield* runCommand(
    [
      "bunx",
      "oxfmt",
      "--check",
      ...productionSources,
      "tests/effect-encoding-hex.test.ts",
      "scripts/accept/0050-effect-encoding-hex-consolidation.ts",
      "design-specs/0050-effect-encoding-hex-consolidation.md",
      "plans/completed/0050-effect-encoding-hex-consolidation.md",
      "model/work/effect-encoding-hex-consolidation.json",
    ],
    { cwd: root },
  );
  yield* runCommand(["bun", "run", "semproj", "--", "validate"], { cwd: root });
  yield* runCommand(["bun", "run", "semproj", "--", "generate", "--check"], { cwd: root });
});

runMain("accept/0050", program);
