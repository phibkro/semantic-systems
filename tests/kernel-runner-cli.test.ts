import { readFileSync } from "node:fs";
import { Effect } from "effect";
import { describe, expect, test } from "bun:test";
import {
  KernelCliHostError,
  kernelRunExitCode,
  runKernelCli,
  type KernelCliHost,
} from "../src/kernel-cli/cli.ts";
import {
  encodeCanonicalKernelRunObservation,
  interpretKernelJsonBytes,
  type KernelRunObservation,
} from "../src/kernel-interpreter/index.ts";
import { encodeCanonicalKernelDocument } from "../src/kernel-json/index.ts";
import { compileSurfaceDocument } from "../src/surface-language/index.ts";

interface HostProbe {
  readonly host: KernelCliHost;
  readonly reads: Array<string>;
  readonly stdout: Array<Uint8Array>;
  readonly stderr: Array<string>;
}

const makeHost = (
  input: Uint8Array,
  failure?: "read-input" | "write-stdout" | "write-stderr",
): HostProbe => {
  const reads: Array<string> = [];
  const stdout: Array<Uint8Array> = [];
  const stderr: Array<string> = [];
  const fail = (operation: "read-input" | "write-stdout" | "write-stderr") =>
    Effect.fail(new KernelCliHostError({ operation }));
  return {
    reads,
    stdout,
    stderr,
    host: {
      readInput: (source) => {
        reads.push(source);
        return failure === "read-input" ? fail("read-input") : Effect.succeed(input.slice());
      },
      writeStdout: (bytes) =>
        failure === "write-stdout"
          ? fail("write-stdout")
          : Effect.sync(() => {
              stdout.push(bytes.slice());
            }),
      writeStderr: (text) =>
        failure === "write-stderr"
          ? fail("write-stderr")
          : Effect.sync(() => {
              stderr.push(text);
            }),
    },
  };
};

const fixtureBytes = (name: string): Uint8Array =>
  readFileSync(new URL(`../examples/kernel-json/${name}`, import.meta.url));

const text = (bytes: Uint8Array): string => new TextDecoder().decode(bytes);

describe("kernel runner CLI", () => {
  test("reads once and writes the exact canonical returned observation once", () => {
    const input = fixtureBytes("pure-program.kernel.json");
    const probe = makeHost(input);
    const code = Effect.runSync(runKernelCli(["run", "program.kernel.json"], probe.host));

    expect(code).toBe(0);
    expect(probe.reads).toEqual(["program.kernel.json"]);
    expect(probe.stdout).toHaveLength(1);
    expect(probe.stderr).toEqual([]);
    expect(probe.stdout[0]).toEqual(
      encodeCanonicalKernelRunObservation(interpretKernelJsonBytes(input)),
    );
    expect(text(probe.stdout[0]!)).toBe(
      readFileSync(
        new URL("../examples/kernel-json/pure-program.kernel-run.json.golden", import.meta.url),
        "utf8",
      ),
    );
  });

  test("exposes an unhandled operation as a successful suspension request", () => {
    const source = readFileSync(
      new URL("../examples/surface-language/unhandled-two-step.semantic", import.meta.url),
      "utf8",
    );
    const compilation = Effect.runSync(compileSurfaceDocument(source));
    const input = encodeCanonicalKernelDocument(compilation.kernel);
    const probe = makeHost(input);
    const code = Effect.runSync(runKernelCli(["run", "-"], probe.host));

    expect(code).toBe(0);
    expect(probe.reads).toEqual(["-"]);
    const observation = JSON.parse(text(probe.stdout[0]!)) as KernelRunObservation;
    expect(observation.observation).toEqual({
      tag: "suspended",
      request: {
        label: "fresh",
        operation: "allocate",
        argument: { kind: "unit" },
        result_type: { kind: "int" },
      },
    });
  });

  test.each([
    ["invalid UTF-8", new Uint8Array([0xff, 0xfe])],
    ["duplicate key", new TextEncoder().encode('{"version":1,"version":1}')],
    ["malformed JSON", new TextEncoder().encode("{")],
  ])("turns %s into a canonical representation rejection", (_label, input) => {
    const probe = makeHost(input);
    const code = Effect.runSync(runKernelCli(["run", "-"], probe.host));

    expect(code).toBe(1);
    expect(probe.stderr).toEqual([]);
    const observation = JSON.parse(text(probe.stdout[0]!)) as KernelRunObservation;
    expect(observation.observation.tag).toBe("representation-rejected");
  });

  test("keeps checker rejection distinct and never reports successful execution", () => {
    const input = fixtureBytes("rejected-type-mismatch.kernel.json");
    const probe = makeHost(input);
    const code = Effect.runSync(runKernelCli(["run", "rejected.kernel.json"], probe.host));

    expect(code).toBe(1);
    const observation = JSON.parse(text(probe.stdout[0]!)) as KernelRunObservation;
    expect(observation.observation.tag).toBe("check-rejected");
  });

  test("classifies inconclusive observations as unsuccessful", () => {
    const observation: KernelRunObservation = {
      format: "semantic.kernel-run",
      version: 1,
      kernel: "semantic.kernel-calculus/0018/v1",
      observation: { tag: "inconclusive", reason: "fuel" },
    };
    expect(kernelRunExitCode(observation)).toBe(1);
  });

  test("usage failure exits before reading or writing semantic stdout", () => {
    const probe = makeHost(new Uint8Array());
    const code = Effect.runSync(runKernelCli(["run"], probe.host));

    expect(code).toBe(2);
    expect(probe.reads).toEqual([]);
    expect(probe.stdout).toEqual([]);
    expect(probe.stderr).toEqual(["usage: semantic-kernel run FILE|-\n"]);
  });

  test("input failure exits before semantic stdout and hides host details", () => {
    const probe = makeHost(new Uint8Array(), "read-input");
    const code = Effect.runSync(runKernelCli(["run", "missing"], probe.host));

    expect(code).toBe(2);
    expect(probe.reads).toEqual(["missing"]);
    expect(probe.stdout).toEqual([]);
    expect(probe.stderr).toEqual(["semantic-kernel: unable to read input\n"]);
  });

  test("output failure exits 2 and a failed diagnostic write cannot escape", () => {
    const outputFailure = makeHost(fixtureBytes("pure-program.kernel.json"), "write-stdout");
    expect(Effect.runSync(runKernelCli(["run", "program.kernel.json"], outputFailure.host))).toBe(
      2,
    );
    expect(outputFailure.stdout).toEqual([]);
    expect(outputFailure.stderr).toEqual(["semantic-kernel: unable to write output\n"]);

    const diagnosticFailure = makeHost(new Uint8Array(), "write-stderr");
    expect(Effect.runSync(runKernelCli([], diagnosticFailure.host))).toBe(2);
  });

  test("the command closure contains no parser or bytecode backend", () => {
    const sources = ["cli.ts", "process-host.ts", "main-bun.ts", "main-node.ts"].map((name) =>
      readFileSync(new URL(`../src/kernel-cli/${name}`, import.meta.url), "utf8"),
    );
    expect(sources.join("\n")).not.toContain("JSON.parse");
    expect(sources.join("\n")).not.toContain("kernel-bytecode");
  });
});
