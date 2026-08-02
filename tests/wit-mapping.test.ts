import { readFile } from "node:fs/promises";
import { describe, expect, test } from "bun:test";
import { BunCrypto } from "@effect/platform-bun";
import { Effect } from "effect";
import {
  decodePortableBoundary,
  defaultWitMappingBounds,
  encodeWitMappingManifest,
  generateWitMapping,
  type PortableBoundaryInput,
  type WitMappingArtifact,
} from "../src/wit-mapping/index.ts";

const fixture = JSON.parse(
  await readFile(new URL("../examples/wit-mapping/inventory.input.json", import.meta.url), "utf8"),
) as unknown;

const decodeFixture = (): PortableBoundaryInput => {
  const decoded = decodePortableBoundary(fixture);
  expect(decoded.status).toBe("decoded");
  if (decoded.status === "rejected") throw new Error(JSON.stringify(decoded.diagnostics));
  return decoded.value;
};

const generate = async (input: PortableBoundaryInput): Promise<WitMappingArtifact> =>
  Effect.runPromise(generateWitMapping(input).pipe(Effect.provide(BunCrypto.layer)));

const diagnosticCode = (input: unknown): string => {
  const decoded = decodePortableBoundary(input);
  expect(decoded.status).toBe("rejected");
  if (decoded.status === "decoded") throw new Error("expected rejection");
  return decoded.diagnostics[0]!.code;
};

describe("semantic.wit-mapping/v1", () => {
  test("renders native async, stream, and future shapes without resource desugaring", async () => {
    const artifact = await generate(decodeFixture());
    expect(artifact.wit).toContain("reserve: async func");
    expect(artifact.wit).toContain(
      "watch: func() -> tuple<stream<inventory-event>, future<result<_, inventory-error>>>;",
    );
    expect(artifact.wit).toContain(
      "open: static async func(request: reservation-request) -> reservation;",
    );
    expect(artifact.wit).not.toContain("static open:");
    expect(artifact.wit).toContain("release: async func() -> reservation-state;");
    expect(artifact.wit).not.toContain("resource stream");
    expect(artifact.wit).not.toContain("resource future");
  });

  test("keeps world direction and owned versus borrowed resource handles explicit", async () => {
    const artifact = await generate(decodeFixture());
    expect(artifact.wit).toContain("import fresh-identifiers;");
    expect(artifact.wit).toContain("export inventory;");
    expect(artifact.wit).toContain("constructor(request: reservation-request);");
    expect(artifact.wit).toContain("snapshot: func(other: borrow<reservation>)");
    expect(artifact.wit).toContain("-> result<reservation, inventory-error>");
    const ownership = artifact.manifest.mappings.filter(
      (row) => row.projection === "ownership_boundary",
    );
    expect(ownership.some((row) => row.detail?.includes("borrow<reservation>"))).toBe(true);
    expect(ownership.some((row) => row.detail?.includes("owned handle"))).toBe(true);
  });

  test("exhaustively records laws, effects, grades, assumptions, evidence, and claims", async () => {
    const artifact = await generate(decodeFixture());
    const dimensions = new Set(
      artifact.manifest.semantic_dimensions.map((row) => `${row.kind}:${row.id}`),
    );
    expect(dimensions).toEqual(
      new Set([
        "law:rejection-is-noop",
        "law:replay-agrees-with-transition",
        "effect_label:effect.clock",
        "effect_label:effect.fresh",
        "usage_grade:linear",
        "assumption:inventory.initial-state",
        "assumption:reservation.drop",
        "evidence_requirement:inventory.conformance",
      ]),
    );
    expect(artifact.manifest.unsupported_claims).toHaveLength(5);
    expect(artifact.manifest.unsupported_claims.join("\n")).toContain(
      "WIT validation does not establish Semantic theory realization",
    );
    expect(artifact.manifest.unsupported_claims.join("\n")).toContain(
      "async func, stream<T>, and future<T>",
    );
    expect(artifact.manifest.unsupported_claims.join("\n")).toContain(
      "WIT resource exposes handle ownership shape",
    );
    expect(artifact.manifest.unsupported_claims.join("\n")).toContain(
      "imported interface names a capability boundary",
    );
    expect(artifact.manifest.unsupported_claims.join("\n")).toContain(
      "Companion laws and evidence are declarations",
    );
  });

  test("changing only a companion law changes manifest identity but not WIT identity", async () => {
    const original = decodeFixture();
    const changed = structuredClone(fixture) as Record<string, unknown>;
    const theory = changed.theory as Record<string, unknown>;
    const laws = theory.laws as Array<Record<string, unknown>>;
    laws.pop();
    const changedDecoded = decodePortableBoundary(changed);
    expect(changedDecoded.status).toBe("decoded");
    if (changedDecoded.status === "rejected")
      throw new Error(JSON.stringify(changedDecoded.diagnostics));
    const [before, after] = await Promise.all([generate(original), generate(changedDecoded.value)]);
    expect(before.wit).toBe(after.wit);
    expect(before.wit_identity).toBe(after.wit_identity);
    expect(encodeWitMappingManifest(before.manifest)).not.toEqual(
      encodeWitMappingManifest(after.manifest),
    );
    expect(before.manifest_identity).not.toBe(after.manifest_identity);
  });

  test("reordered descriptor collections have byte-identical canonical output", async () => {
    const reordered = structuredClone(fixture) as Record<string, unknown>;
    const interfaces = reordered.interfaces as Array<Record<string, unknown>>;
    interfaces.reverse();
    for (const interfaceValue of interfaces) {
      (interfaceValue.types as unknown[]).reverse();
      (interfaceValue.functions as unknown[]).reverse();
      for (const declaration of interfaceValue.types as Array<Record<string, unknown>>) {
        if (declaration.kind === "resource") {
          (declaration.methods as unknown[]).reverse();
          (declaration.statics as unknown[]).reverse();
        }
      }
    }
    const theory = reordered.theory as Record<string, unknown>;
    for (const key of [
      "laws",
      "effect_labels",
      "usage_grades",
      "assumptions",
      "evidence_requirements",
    ]) {
      (theory[key] as unknown[]).reverse();
    }
    const decoded = decodePortableBoundary(reordered);
    expect(decoded.status).toBe("decoded");
    if (decoded.status === "rejected") throw new Error(JSON.stringify(decoded.diagnostics));
    const [left, right] = await Promise.all([generate(decodeFixture()), generate(decoded.value)]);
    expect(left.wit).toBe(right.wit);
    expect(left.wit_identity).toBe(right.wit_identity);
    expect(encodeWitMappingManifest(left.manifest)).toEqual(
      encodeWitMappingManifest(right.manifest),
    );
    expect(left.manifest_identity).toBe(right.manifest_identity);
  });

  test("rejects unsupported type forms, invalid names, ambiguous directions, and bounds", () => {
    const unsupported = structuredClone(fixture) as Record<string, unknown>;
    const interfaces = unsupported.interfaces as Array<Record<string, unknown>>;
    const inventory = interfaces[1]!;
    const functions = inventory.functions as Array<Record<string, unknown>>;
    const parameters = functions[0]!.params as Array<Record<string, unknown>>;
    parameters[0]!.type = { kind: "function", params: [], result: "string" };
    expect(diagnosticCode(unsupported)).toBe("type.unsupported");

    const invalidName = structuredClone(fixture) as Record<string, unknown>;
    (invalidName.interfaces as Array<Record<string, unknown>>)[1]!.name = "inventory_interface";
    expect(diagnosticCode(invalidName)).toBe("name.invalid");

    const reservedName = structuredClone(fixture) as Record<string, unknown>;
    const reservedInterfaces = reservedName.interfaces as Array<Record<string, unknown>>;
    const reservedFunctions = reservedInterfaces[1]!.functions as Array<Record<string, unknown>>;
    reservedFunctions[0]!.name = "own";
    expect(diagnosticCode(reservedName)).toBe("name.invalid");

    const dottedNamespace = structuredClone(fixture) as Record<string, unknown>;
    (dottedNamespace.package as Record<string, unknown>).namespace = "semantic.core";
    expect(diagnosticCode(dottedNamespace)).toBe("package.invalid-identifier");

    const ambiguous = structuredClone(fixture) as Record<string, unknown>;
    (ambiguous.world as Record<string, unknown>).exports = ["fresh-identifiers", "inventory"];
    expect(diagnosticCode(ambiguous)).toBe("world.ambiguous-direction");

    const bounded = decodePortableBoundary(fixture, { maximum_interfaces: 1 });
    expect(bounded.status).toBe("rejected");
    if (bounded.status === "rejected")
      expect(bounded.diagnostics[0]!.code).toBe("bounds.collection-too-large");
    expect(defaultWitMappingBounds.maximum_depth).toBe(32);
  });
});
