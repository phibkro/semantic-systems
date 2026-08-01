import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawn, spawnSync } from "node:child_process";
import test from "node:test";

const root = new URL("..", import.meta.url);
const nodeExecutable = process.env.SEMANTIC_NODE_BIN ?? process.execPath;

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
  const entry = runtime === "bun" ? "src/kernel-cli/main-bun.ts" : "src/kernel-cli/main-node.ts";
  return spawnSync(executable, [entry, ...arguments_], {
    cwd: root,
    input,
    encoding: "buffer",
  });
};

const runWithClosedStdout = (
  runtime: "bun" | "node",
): Promise<{ readonly status: number | null; readonly stderr: string }> =>
  new Promise((resolve, reject) => {
    const executable = runtime === "bun" ? "bun" : nodeExecutable;
    const entry = runtime === "bun" ? "src/kernel-cli/main-bun.ts" : "src/kernel-cli/main-node.ts";
    const child = spawn(
      executable,
      [entry, "run", "examples/kernel-json/pure-program.kernel.json"],
      { cwd: root, stdio: ["ignore", "pipe", "pipe"] },
    );
    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    const lifecycle = child as unknown as {
      readonly once: {
        (event: "error", listener: (error: Error) => void): void;
        (event: "close", listener: (status: number | null) => void): void;
      };
    };
    lifecycle.once("error", reject);
    lifecycle.once("close", (status) => resolve({ status, stderr }));
    child.stdout.destroy();
  });

test("genuine Node and Bun emit byte-identical canonical file observations", async () => {
  const expected = await readFile(
    new URL("../examples/kernel-json/pure-program.kernel-run.json.golden", import.meta.url),
  );
  const commandArguments = ["run", "examples/kernel-json/pure-program.kernel.json"];
  const bun = run("bun", commandArguments);
  const node = run("node", commandArguments);

  assert.equal(bun.status, 0, bun.stderr.toString());
  assert.equal(node.status, 0, node.stderr.toString());
  assert.deepEqual(bun.stdout, expected);
  assert.deepEqual(node.stdout, expected);
  assert.deepEqual(node.stdout, bun.stdout);
  assert.equal(bun.stderr.length, 0);
  assert.equal(node.stderr.length, 0);
});

test("genuine Node and Bun emit byte-identical stdin rejections", () => {
  const input = Buffer.from('{"version":1,"version":1}');
  const bun = run("bun", ["run", "-"], input);
  const node = run("node", ["run", "-"], input);

  assert.equal(bun.status, 1, bun.stderr.toString());
  assert.equal(node.status, 1, node.stderr.toString());
  assert.deepEqual(node.stdout, bun.stdout);
  assert.equal(JSON.parse(node.stdout.toString()).observation.tag, "representation-rejected");
  assert.equal(bun.stderr.length, 0);
  assert.equal(node.stderr.length, 0);
});

test("genuine Node and Bun keep host failures off stdout", () => {
  const bun = run("bun", ["run", "missing.kernel.json"]);
  const node = run("node", ["run", "missing.kernel.json"]);

  assert.equal(bun.status, 2);
  assert.equal(node.status, 2);
  assert.equal(bun.stdout.length, 0);
  assert.equal(node.stdout.length, 0);
  assert.equal(bun.stderr.toString(), "semantic-kernel: unable to read input\n");
  assert.deepEqual(node.stderr, bun.stderr);
});

test("genuine Node and Bun classify a closed output stream without host details", async () => {
  const [bun, node] = await Promise.all([runWithClosedStdout("bun"), runWithClosedStdout("node")]);

  assert.deepEqual(bun, { status: 2, stderr: "semantic-kernel: unable to write output\n" });
  assert.deepEqual(node, bun);
});
