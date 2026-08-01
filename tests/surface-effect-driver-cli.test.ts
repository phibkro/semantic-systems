import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";
import { Effect } from "effect";
import { runSurfaceCli, SurfaceCliHostError, type SurfaceCliHost } from "../src/surface-cli/cli.ts";
import { driveSurfaceSourceBytes, surfaceEffectRunExitCode } from "../src/surface-cli/drive.ts";
import {
  encodeCanonicalSurfaceEffectRunObservation,
  type SurfaceEffectRunObservation,
} from "../src/surface-cli/effect-schema.ts";
import {
  decodeObservationScriptBytes,
  maximumObservationScriptBytes,
} from "../src/surface-cli/observation-script-bytes.ts";

interface HostProbe {
  readonly host: SurfaceCliHost;
  readonly reads: Array<string>;
  readonly stdout: Array<Uint8Array>;
  readonly stderr: Array<string>;
}

const makeHost = (
  inputs: Readonly<Record<string, Uint8Array>>,
  failure?: {
    readonly operation: "read-input" | "write-stdout" | "write-stderr";
    readonly source?: string;
  },
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
        const input = inputs[source];
        return failure?.operation === "read-input" && failure.source === source
          ? fail("read-input")
          : input === undefined
            ? fail("read-input")
            : Effect.succeed(input.slice());
      },
      writeStdout: (value) =>
        failure?.operation === "write-stdout"
          ? fail("write-stdout")
          : Effect.sync(() => {
              stdout.push(value.slice());
            }),
      writeStderr: (value) =>
        failure?.operation === "write-stderr"
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
const script = (...observations: ReadonlyArray<unknown>): Uint8Array =>
  bytes(
    JSON.stringify({
      format: "semantic.kernel-observation-script",
      version: 1,
      observations,
    }),
  );

const decodeOutput = (probe: HostProbe): SurfaceEffectRunObservation =>
  JSON.parse(text(probe.stdout[0]!)) as SurfaceEffectRunObservation;

const allObjectsFrozen = (value: unknown, seen = new Set<object>()): boolean => {
  if (typeof value !== "object" || value === null || seen.has(value)) return true;
  seen.add(value);
  return (
    Object.isFrozen(value) && Object.values(value).every((child) => allObjectsFrozen(child, seen))
  );
};

describe("surface effect-driver CLI", () => {
  test("reads source then script once and completes two affine requests", () => {
    const source = fixture("unhandled-two-step.semantic");
    const observations = script({ kind: "int", value: 42 }, { kind: "bool", value: true });
    const probe = makeHost({ "program.semantic": source, "observations.json": observations });
    const code = Effect.runSync(
      runSurfaceCli(["drive", "program.semantic", "observations.json"], probe.host),
    );

    expect(code).toBe(0);
    expect(probe.reads).toEqual(["program.semantic", "observations.json"]);
    expect(probe.stderr).toEqual([]);
    expect(probe.stdout).toHaveLength(1);
    const direct = Effect.runSync(driveSurfaceSourceBytes(source, observations));
    expect(probe.stdout[0]).toEqual(encodeCanonicalSurfaceEffectRunObservation(direct));
    expect(direct.observation).toEqual({
      tag: "effect-observed",
      effect_run: {
        format: "semantic.kernel-effect-run",
        version: 1,
        kernel: "semantic.kernel-calculus/0018/v1",
        observation: {
          tag: "executed",
          provided_observations: 2,
          applied_observations: 2,
          requests: [
            {
              label: "fresh",
              operation: "allocate",
              argument: { kind: "unit" },
              result_type: { kind: "int" },
            },
            {
              label: "confirm",
              operation: "accept",
              argument: { kind: "int", value: 42 },
              result_type: { kind: "bool" },
            },
          ],
          result: { tag: "returned", value: { kind: "bool", value: true } },
        },
      },
    });
    expect(allObjectsFrozen(direct)).toBeTrue();
  });

  test("preserves prefix suspension and wrong-type non-consumption", () => {
    const source = fixture("unhandled-two-step.semantic");
    const prefix = Effect.runSync(
      driveSurfaceSourceBytes(source, script({ kind: "int", value: 7 })),
    );
    expect(surfaceEffectRunExitCode(prefix)).toBe(0);
    expect(prefix.observation).toMatchObject({
      tag: "effect-observed",
      effect_run: {
        observation: {
          tag: "executed",
          applied_observations: 1,
          requests: [{ label: "fresh" }, { label: "confirm" }],
          result: { tag: "suspended", request: { label: "confirm" } },
        },
      },
    });

    const wrongType = Effect.runSync(
      driveSurfaceSourceBytes(source, script({ kind: "bool", value: true })),
    );
    expect(surfaceEffectRunExitCode(wrongType)).toBe(1);
    expect(wrongType.observation).toMatchObject({
      tag: "effect-observed",
      effect_run: {
        observation: {
          tag: "executed",
          applied_observations: 0,
          requests: [{ label: "fresh" }],
          result: {
            tag: "runtime-rejected",
            diagnostic: { code: "external-observation.result-type-mismatch" },
          },
        },
      },
    });
  });

  test("source rejection has custody precedence over script reading", () => {
    const source = bytes('kernel "semantic.kernel-calculus/0018/v1"; run return[1]');
    const probe = makeHost(
      { "broken.semantic": source },
      { operation: "read-input", source: "missing-observations.json" },
    );
    const code = Effect.runSync(
      runSurfaceCli(["drive", "broken.semantic", "missing-observations.json"], probe.host),
    );

    expect(code).toBe(1);
    expect(probe.reads).toEqual(["broken.semantic"]);
    expect(probe.stderr).toEqual([]);
    expect(decodeOutput(probe).observation).toMatchObject({
      tag: "source-rejected",
      diagnostic: { phase: "parse", code: "surface.parse.expected" },
    });
  });

  test.each([
    ["invalid UTF-8", new Uint8Array([0xff]), "external-observation-script.byte.invalid-utf8"],
    ["invalid grammar", bytes('{"format":'), "external-observation-script.byte.json-grammar"],
    [
      "duplicate key",
      bytes(
        '{"format":"semantic.kernel-observation-script","format":"semantic.kernel-observation-script","version":1,"observations":[]}',
      ),
      "external-observation-script.byte.duplicate-key",
    ],
    [
      "excess schema field",
      bytes(
        '{"format":"semantic.kernel-observation-script","version":1,"observations":[],"extra":true}',
      ),
      "external-observation-script.invalid",
    ],
  ] as const)("reports %s as a script observation", (_label, input, expectedCode) => {
    const decoded = decodeObservationScriptBytes(input);
    expect(decoded.status).toBe("rejected");
    if (decoded.status === "rejected") {
      expect(decoded.observation.observation).toMatchObject({
        tag: "script-rejected",
        diagnostics: [{ code: expectedCode, path: "$" }],
      });
      expect(
        surfaceEffectRunExitCode({
          format: "semantic.surface-effect-run",
          version: 1,
          surface: "semantic.surface-language/0026/v1",
          kernel: "semantic.kernel-calculus/0018/v1",
          observation: { tag: "effect-observed", effect_run: decoded.observation },
        }),
      ).toBe(1);
    }
  });

  test("enforces exact byte, JSON depth, and JSON node bounds", () => {
    const base = text(script());
    const exact = bytes(`${base}${" ".repeat(maximumObservationScriptBytes - bytes(base).length)}`);
    expect(exact.byteLength).toBe(maximumObservationScriptBytes);
    expect(decodeObservationScriptBytes(exact).status).toBe("decoded");

    const excess = new Uint8Array(maximumObservationScriptBytes + 1);
    expect(decodeObservationScriptBytes(excess)).toMatchObject({
      status: "rejected",
      observation: {
        observation: {
          diagnostics: [{ code: "external-observation-script.byte.bytes-exceeded" }],
        },
      },
    });

    const tooDeep = bytes(`${"[".repeat(130)}0${"]".repeat(130)}`);
    expect(decodeObservationScriptBytes(tooDeep)).toMatchObject({
      status: "rejected",
      observation: {
        observation: {
          diagnostics: [{ code: "external-observation-script.decode.depth-exceeded" }],
        },
      },
    });

    const tooManyNodes = bytes(`[${"0,".repeat(65_536)}0]`);
    expect(decodeObservationScriptBytes(tooManyNodes)).toMatchObject({
      status: "rejected",
      observation: {
        observation: {
          diagnostics: [{ code: "external-observation-script.decode.nodes-exceeded" }],
        },
      },
    });
  });

  test("rejects ambiguous stdin and classifies host failures outside stdout", () => {
    const ambiguous = makeHost({});
    expect(Effect.runSync(runSurfaceCli(["drive", "-", "-"], ambiguous.host))).toBe(2);
    expect(ambiguous.reads).toEqual([]);
    expect(ambiguous.stdout).toEqual([]);
    expect(ambiguous.stderr).toEqual(["usage: semantic drive SOURCE_FILE|- OBSERVATIONS_FILE|-\n"]);

    const source = fixture("unhandled-two-step.semantic");
    const readFailure = makeHost(
      { "program.semantic": source },
      { operation: "read-input", source: "missing.json" },
    );
    expect(
      Effect.runSync(
        runSurfaceCli(["drive", "program.semantic", "missing.json"], readFailure.host),
      ),
    ).toBe(2);
    expect(readFailure.stdout).toEqual([]);
    expect(readFailure.stderr).toEqual(["semantic: unable to read input\n"]);

    const writeFailure = makeHost(
      { "program.semantic": source, "observations.json": script() },
      { operation: "write-stdout" },
    );
    expect(
      Effect.runSync(
        runSurfaceCli(["drive", "program.semantic", "observations.json"], writeFailure.host),
      ),
    ).toBe(2);
    expect(writeFailure.stderr).toEqual(["semantic: unable to write output\n"]);
  });

  test("rejects forged outer fields and owns no alternative execution path", () => {
    const valid = Effect.runSync(
      driveSurfaceSourceBytes(fixture("unhandled-two-step.semantic"), script()),
    );
    expect(() =>
      encodeCanonicalSurfaceEffectRunObservation({
        ...valid,
        extra: true,
      } as SurfaceEffectRunObservation),
    ).toThrow();

    const files = [
      "cli.ts",
      "source.ts",
      "effect-schema.ts",
      "observation-script-bytes.ts",
      "drive.ts",
      "process-host.ts",
      "main-bun.ts",
      "main-node.ts",
    ];
    const sources = files.map((name) =>
      readFileSync(new URL(`../src/surface-cli/${name}`, import.meta.url), "utf8"),
    );
    expect(sources.join("\n")).not.toContain("JSON.parse");
    expect(sources.join("\n")).not.toContain("kernel-bytecode");
    expect(sources.join("\n")).not.toContain("surface-execution");
  });
});
