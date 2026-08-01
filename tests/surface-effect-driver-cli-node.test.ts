import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const root = new URL("..", import.meta.url);
const nodeExecutable = process.env.SEMANTIC_NODE_BIN ?? process.execPath;
const script = (observations: ReadonlyArray<unknown> = []): Buffer =>
  Buffer.from(
    JSON.stringify({
      format: "semantic.kernel-observation-script",
      version: 1,
      observations,
    }),
  );

interface ProcessResult {
  readonly status: number | null;
  readonly stdout: Buffer;
  readonly stderr: Buffer;
}

const run = (
  runtime: "bun" | "node",
  arguments_: ReadonlyArray<string>,
  input?: Uint8Array,
): ProcessResult => {
  const executable = runtime === "bun" ? "bun" : nodeExecutable;
  const entry = runtime === "bun" ? "src/surface-cli/main-bun.ts" : "src/surface-cli/main-node.ts";
  return spawnSync(executable, [entry, ...arguments_], {
    cwd: root,
    input,
    encoding: "buffer",
  });
};

test("genuine Node and Bun emit byte-identical completed affine observations", () => {
  const commandArguments = ["drive", "examples/surface-language/unhandled-two-step.semantic", "-"];
  const input = script([
    { kind: "int", value: 42 },
    { kind: "bool", value: true },
  ]);
  const bun = run("bun", commandArguments, input);
  const node = run("node", commandArguments, input);

  assert.equal(bun.status, 0, bun.stderr.toString());
  assert.equal(node.status, 0, node.stderr.toString());
  assert.deepEqual(node.stdout, bun.stdout);
  assert.equal(bun.stderr.length, 0);
  assert.equal(node.stderr.length, 0);
  const observation = JSON.parse(node.stdout.toString());
  assert.equal(observation.observation.tag, "effect-observed");
  assert.equal(observation.observation.effect_run.observation.applied_observations, 2);
  assert.equal(observation.observation.effect_run.observation.result.tag, "returned");
});

test("genuine Node and Bun give rejected source precedence over a missing script", () => {
  const temporary = mkdtempSync(join(tmpdir(), "semantic-drive-source-"));
  try {
    const malformed = join(temporary, "malformed.semantic");
    writeFileSync(malformed, 'kernel "semantic.kernel-calculus/0018/v1"; run return[1]');
    const commandArguments = ["drive", malformed, join(temporary, "missing.json")];
    const bun = run("bun", commandArguments);
    const node = run("node", commandArguments);

    assert.equal(bun.status, 1, bun.stderr.toString());
    assert.equal(node.status, 1, node.stderr.toString());
    assert.deepEqual(node.stdout, bun.stdout);
    assert.equal(bun.stderr.length, 0);
    assert.equal(node.stderr.length, 0);
    assert.equal(JSON.parse(node.stdout.toString()).observation.tag, "source-rejected");
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

test("genuine Node and Bun preserve script rejection as semantic stdout", () => {
  const commandArguments = ["drive", "examples/surface-language/unhandled-two-step.semantic", "-"];
  const input = Buffer.from(
    '{"format":"semantic.kernel-observation-script","version":1,"version":1,"observations":[]}',
  );
  const bun = run("bun", commandArguments, input);
  const node = run("node", commandArguments, input);

  assert.equal(bun.status, 1, bun.stderr.toString());
  assert.equal(node.status, 1, node.stderr.toString());
  assert.deepEqual(node.stdout, bun.stdout);
  assert.equal(bun.stderr.length, 0);
  assert.equal(node.stderr.length, 0);
  assert.equal(
    JSON.parse(node.stdout.toString()).observation.effect_run.observation.diagnostics[0].code,
    "external-observation-script.byte.duplicate-key",
  );
});

test("genuine Node and Bun reject two stdin owners before reading", () => {
  const bun = run("bun", ["drive", "-", "-"], Buffer.from("unobserved"));
  const node = run("node", ["drive", "-", "-"], Buffer.from("unobserved"));

  assert.equal(bun.status, 2);
  assert.equal(node.status, 2);
  assert.equal(bun.stdout.length, 0);
  assert.equal(node.stdout.length, 0);
  assert.deepEqual(node.stderr, bun.stderr);
  assert.equal(node.stderr.toString(), "usage: semantic drive SOURCE_FILE|- OBSERVATIONS_FILE|-\n");
});

test("genuine Node and Bun cut an over-limit script prefix", () => {
  const commandArguments = ["drive", "examples/surface-language/unhandled-two-step.semantic", "-"];
  const input = Buffer.alloc(1_048_577, 0x20);
  const bun = run("bun", commandArguments, input);
  const node = run("node", commandArguments, input);

  assert.equal(bun.status, 1, bun.stderr.toString());
  assert.equal(node.status, 1, node.stderr.toString());
  assert.deepEqual(node.stdout, bun.stdout);
  assert.equal(
    JSON.parse(node.stdout.toString()).observation.effect_run.observation.diagnostics[0].code,
    "external-observation-script.byte.bytes-exceeded",
  );
});
