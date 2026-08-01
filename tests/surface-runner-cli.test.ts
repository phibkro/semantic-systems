import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";
import { Effect } from "effect";
import {
  observeSurfaceSourceBytes,
  runSurfaceCli,
  SurfaceCliHostError,
  surfaceRunExitCode,
  type SurfaceCliHost,
} from "../src/surface-cli/cli.ts";
import {
  encodeCanonicalSurfaceRunObservation,
  type SurfaceRunObservation,
  type SurfaceSourceDiagnostic,
} from "../src/surface-cli/schema.ts";

interface HostProbe {
  readonly host: SurfaceCliHost;
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
    Effect.fail(new SurfaceCliHostError({ operation }));
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
      writeStderr: (value) =>
        failure === "write-stderr"
          ? fail("write-stderr")
          : Effect.sync(() => {
              stderr.push(value);
            }),
    },
  };
};

const bytes = (value: string): Uint8Array => new TextEncoder().encode(value);
const text = (value: Uint8Array): string => new TextDecoder().decode(value);
const fixture = (name: string): Uint8Array =>
  readFileSync(new URL(`../examples/surface-language/${name}`, import.meta.url));
const marker = 'kernel "semantic.kernel-calculus/0018/v1";\n';

const decodeOutput = (probe: HostProbe): SurfaceRunObservation =>
  JSON.parse(text(probe.stdout[0]!)) as SurfaceRunObservation;

const sourceRejectionCases: ReadonlyArray<
  readonly [string, Uint8Array, SurfaceSourceDiagnostic["phase"], string]
> = [
  ["invalid UTF-8", new Uint8Array([0xff]), "input", "surface.input.invalid-utf8"],
  ["lex failure", bytes(`${marker}run return[1] @`), "lex", "surface.lex.invalid-character"],
  ["parse failure", bytes(`${marker}run return[1]`), "parse", "surface.parse.expected"],
  [
    "elaboration failure",
    bytes(`${marker}run return[1] missing`),
    "elaboration",
    "surface.elaboration.unbound-value",
  ],
];

describe("surface runner CLI", () => {
  test("reads once and returns one canonical reference observation", () => {
    const input = fixture("handled-fresh.semantic");
    const probe = makeHost(input);
    const code = Effect.runSync(runSurfaceCli(["run", "program.semantic"], probe.host));

    expect(code).toBe(0);
    expect(probe.reads).toEqual(["program.semantic"]);
    expect(probe.stdout).toHaveLength(1);
    expect(probe.stderr).toEqual([]);
    const observation = Effect.runSync(observeSurfaceSourceBytes(input));
    expect(probe.stdout[0]).toEqual(encodeCanonicalSurfaceRunObservation(observation));
    expect(observation.observation).toEqual({
      tag: "kernel-observed",
      kernel_run: {
        format: "semantic.kernel-run",
        version: 1,
        kernel: "semantic.kernel-calculus/0018/v1",
        observation: { tag: "returned", value: { kind: "int", value: 7 } },
      },
    });
  });

  test("preserves an unhandled operation as a successful suspension", () => {
    const probe = makeHost(fixture("unhandled-two-step.semantic"));
    const code = Effect.runSync(runSurfaceCli(["run", "-"], probe.host));
    const observation = decodeOutput(probe);

    expect(code).toBe(0);
    expect(probe.reads).toEqual(["-"]);
    expect(observation.observation.tag).toBe("kernel-observed");
    if (observation.observation.tag === "kernel-observed") {
      expect(observation.observation.kernel_run.observation).toEqual({
        tag: "suspended",
        request: {
          label: "fresh",
          operation: "allocate",
          argument: { kind: "unit" },
          result_type: { kind: "int" },
        },
      });
    }
  });

  test.each(sourceRejectionCases)(
    "emits a canonical source rejection for %s",
    (_label, input, phase, diagnosticCode) => {
      const probe = makeHost(input);
      const code = Effect.runSync(runSurfaceCli(["run", "-"], probe.host));
      const observation = decodeOutput(probe);

      expect(code).toBe(1);
      expect(probe.stderr).toEqual([]);
      expect(observation.observation.tag).toBe("source-rejected");
      if (observation.observation.tag === "source-rejected") {
        expect(observation.observation.diagnostic.phase).toBe(phase);
        expect(observation.observation.diagnostic.code).toBe(diagnosticCode);
      }
    },
  );

  test("keeps an authoritative checker rejection nested as a kernel outcome", () => {
    const source = `${marker}run (fun (value : Int) [1] => return[1] value)(true)`;
    const probe = makeHost(bytes(source));
    const code = Effect.runSync(runSurfaceCli(["run", "-"], probe.host));
    const observation = decodeOutput(probe);

    expect(code).toBe(1);
    expect(observation.observation.tag).toBe("kernel-observed");
    if (observation.observation.tag === "kernel-observed") {
      expect(observation.observation.kernel_run.observation.tag).toBe("check-rejected");
    }
  });

  test("cuts excess source and reports the unwarranted span explicitly", () => {
    const probe = makeHost(bytes(" ".repeat(1_048_577)));
    const code = Effect.runSync(runSurfaceCli(["run", "-"], probe.host));
    const observation = decodeOutput(probe);

    expect(code).toBe(1);
    expect(observation.observation).toEqual({
      tag: "source-rejected",
      diagnostic: {
        phase: "lex",
        code: "surface.lex.source-too-large",
        message: "source exceeds the 1048576 byte limit",
        span: { start: 0, end: 0 },
      },
    });
  });

  test("classifies every nested terminal family", () => {
    const outer = (kernel: SurfaceRunObservation["observation"]): SurfaceRunObservation => ({
      format: "semantic.surface-run",
      version: 1,
      surface: "semantic.surface-language/0026/v1",
      kernel: "semantic.kernel-calculus/0018/v1",
      observation: kernel,
    });
    expect(
      surfaceRunExitCode(
        outer({
          tag: "kernel-observed",
          kernel_run: {
            format: "semantic.kernel-run",
            version: 1,
            kernel: "semantic.kernel-calculus/0018/v1",
            observation: { tag: "inconclusive", reason: "fuel" },
          },
        }),
      ),
    ).toBe(1);
  });

  test("usage and host failures never masquerade as semantic observations", () => {
    const usage = makeHost(new Uint8Array());
    expect(Effect.runSync(runSurfaceCli(["run"], usage.host))).toBe(2);
    expect(usage.reads).toEqual([]);
    expect(usage.stdout).toEqual([]);
    expect(usage.stderr).toEqual(["usage: semantic run FILE|-\n"]);

    const inputFailure = makeHost(new Uint8Array(), "read-input");
    expect(Effect.runSync(runSurfaceCli(["run", "missing"], inputFailure.host))).toBe(2);
    expect(inputFailure.stdout).toEqual([]);
    expect(inputFailure.stderr).toEqual(["semantic: unable to read input\n"]);

    const outputFailure = makeHost(fixture("handled-fresh.semantic"), "write-stdout");
    expect(Effect.runSync(runSurfaceCli(["run", "program"], outputFailure.host))).toBe(2);
    expect(outputFailure.stdout).toEqual([]);
    expect(outputFailure.stderr).toEqual(["semantic: unable to write output\n"]);

    const diagnosticFailure = makeHost(new Uint8Array(), "write-stderr");
    expect(Effect.runSync(runSurfaceCli([], diagnosticFailure.host))).toBe(2);
  });

  test("rejects forged observation fields and owns no alternative backend", () => {
    const valid = Effect.runSync(observeSurfaceSourceBytes(fixture("handled-fresh.semantic")));
    expect(() =>
      encodeCanonicalSurfaceRunObservation({ ...valid, extra: true } as SurfaceRunObservation),
    ).toThrow();

    const sources = [
      "cli.ts",
      "schema.ts",
      "source.ts",
      "effect-schema.ts",
      "observation-script-bytes.ts",
      "drive.ts",
      "process-host.ts",
      "main-bun.ts",
      "main-node.ts",
    ].map((name) => readFileSync(new URL(`../src/surface-cli/${name}`, import.meta.url), "utf8"));
    expect(sources.join("\n")).not.toContain("JSON.parse");
    expect(sources.join("\n")).not.toContain("kernel-bytecode");
    expect(sources.join("\n")).not.toContain("surface-execution");
  });
});
