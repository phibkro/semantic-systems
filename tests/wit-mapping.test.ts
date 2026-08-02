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
type JsonRecord = Record<string, unknown>;

const inventoryInterface = (input: JsonRecord): JsonRecord =>
  (input.interfaces as JsonRecord[]).find((entry) => entry.name === "inventory")!;

const inventoryFunction = (input: JsonRecord, name: string): JsonRecord =>
  (inventoryInterface(input).functions as JsonRecord[]).find((entry) => entry.name === name)!;

const inventoryDeclaration = (input: JsonRecord, kind: string): JsonRecord =>
  (inventoryInterface(input).types as JsonRecord[]).find((entry) => entry.kind === kind)!;

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
    const nestedOwnership = ownership.filter((row) => row.wit_path.includes("/result/"));
    expect(nestedOwnership.length).toBeGreaterThan(0);
    expect(nestedOwnership.every((row) => row.semantic_path !== row.wit_path)).toBe(true);
    expect(
      nestedOwnership.some(
        (row) => row.semantic_path === "theory.inventory/operation/reserve/result/ok",
      ),
    ).toBe(true);
  });
  test("maps nested resource constructor handles with constructor provenance", async () => {
    const input = structuredClone(fixture) as JsonRecord;
    const resource = inventoryDeclaration(input, "resource");
    const constructor = resource["constructor"] as JsonRecord;
    const parameter = (constructor.params as JsonRecord[])[0]!;
    parameter.type = "tuple<borrow<reservation>, reservation>";
    const decoded = decodePortableBoundary(input);
    expect(decoded.status).toBe("decoded");
    if (decoded.status === "rejected") throw new Error(JSON.stringify(decoded.diagnostics));
    const artifact = await generate(decoded.value);
    const ownership = artifact.manifest.mappings.filter(
      (row) =>
        row.projection === "ownership_boundary" &&
        row.wit_path.startsWith("interface/inventory/type/reservation/constructor/"),
    );
    expect(
      ownership.some(
        (row) =>
          row.wit_path.endsWith("/param/request/0") &&
          row.semantic_path === "theory.inventory/resource/reservation/constructor/request/0" &&
          row.detail === "borrow<reservation> temporary handle",
      ),
    ).toBe(true);
    expect(
      ownership.some(
        (row) =>
          row.wit_path.endsWith("/param/request/1") &&
          row.semantic_path === "theory.inventory/resource/reservation/constructor/request/1" &&
          row.detail === "reservation owned handle",
      ),
    ).toBe(true);
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
        "assumption:inventory/reservation.drop",
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
  test("collects exported operation effects without theory effect declarations", async () => {
    const input = structuredClone(fixture) as JsonRecord;
    delete (input.theory as JsonRecord).effect_labels;
    const decoded = decodePortableBoundary(input);
    expect(decoded.status).toBe("decoded");
    if (decoded.status === "rejected") throw new Error(JSON.stringify(decoded.diagnostics));
    const artifact = await generate(decoded.value);
    expect(
      artifact.manifest.semantic_dimensions.some(
        (row) => row.kind === "effect_label" && row.id === "effect.clock",
      ),
    ).toBe(true);
    expect(
      artifact.manifest.mappings.some((row) => row.wit_path.endsWith("/effect/effect.clock")),
    ).toBe(false);
  });
  test("classifies named stream aliases as operational async shapes", async () => {
    const input = structuredClone(fixture) as JsonRecord;
    const inventory = inventoryInterface(input);
    (inventory.types as JsonRecord[]).push({
      kind: "type",
      name: "event-stream",
      semantic_path: "theory.inventory/type/event-stream",
      type: { kind: "stream", element: "inventory-event" },
    });
    inventoryFunction(input, "watch").result = "event-stream";
    const decoded = decodePortableBoundary(input);
    expect(decoded.status).toBe("decoded");
    if (decoded.status === "rejected") throw new Error(JSON.stringify(decoded.diagnostics));
    const artifact = await generate(decoded.value);
    expect(
      artifact.manifest.mappings.find(
        (row) => row.wit_path === "interface/inventory/type/event-stream",
      )?.projection,
    ).toBe("operational_async_shape");
    expect(
      artifact.manifest.mappings.find(
        (row) => row.wit_path === "interface/inventory/function/watch",
      )?.projection,
    ).toBe("operational_async_shape");
  });
  test("rejects empty semantic paths for operations, declarations, constructors, and cases", () => {
    const mutations: ReadonlyArray<(input: JsonRecord) => void> = [
      (input) => {
        inventoryFunction(input, "reserve").semantic_path = "";
      },
      (input) => {
        inventoryDeclaration(input, "type").semantic_path = "";
      },
      (input) => {
        const resource = inventoryDeclaration(input, "resource");
        (resource["constructor"] as JsonRecord).semantic_path = "";
      },
      (input) => {
        const variant = inventoryDeclaration(input, "variant");
        (variant.cases as JsonRecord[])[0]!.semantic_path = "";
      },
    ];
    for (const mutate of mutations) {
      const input = structuredClone(fixture) as JsonRecord;
      mutate(input);
      expect(diagnosticCode(input)).toBe("semantic-path.empty");
    }
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

  test("keeps duplicate resource names exhaustive and permutation invariant", async () => {
    const makeInput = (): JsonRecord => {
      const input = structuredClone(fixture) as JsonRecord;
      (input.interfaces as JsonRecord[]).push({
        name: "warehouse",
        semantic_path: "theory.warehouse",
        types: [
          {
            kind: "resource",
            name: "reservation",
            semantic_path: "theory.warehouse/resource/reservation",
            ownership_statement: "The warehouse reservation handle is owned by its holder.",
            drop_assumption: "Dropping a warehouse reservation releases its host record.",
            usage_grade: null,
            constructor: null,
            methods: [],
            statics: [],
          },
        ],
        functions: [],
      });
      return input;
    };
    const leftInput = makeInput();
    const rightInput = structuredClone(leftInput) as JsonRecord;
    (rightInput.interfaces as JsonRecord[]).reverse();
    const leftDecoded = decodePortableBoundary(leftInput);
    const rightDecoded = decodePortableBoundary(rightInput);
    expect(leftDecoded.status).toBe("decoded");
    expect(rightDecoded.status).toBe("decoded");
    if (leftDecoded.status === "rejected") throw new Error(JSON.stringify(leftDecoded.diagnostics));
    if (rightDecoded.status === "rejected")
      throw new Error(JSON.stringify(rightDecoded.diagnostics));
    const [left, right] = await Promise.all([
      generate(leftDecoded.value),
      generate(rightDecoded.value),
    ]);
    expect(left.wit).toBe(right.wit);
    expect(left.wit_identity).toBe(right.wit_identity);
    expect(encodeWitMappingManifest(left.manifest)).toEqual(
      encodeWitMappingManifest(right.manifest),
    );
    expect(left.manifest_identity).toBe(right.manifest_identity);
    const dropDimensions = left.manifest.semantic_dimensions.filter(
      (row) => row.kind === "assumption" && row.id.endsWith(".drop"),
    );
    expect(dropDimensions).toHaveLength(2);
    expect(new Set(dropDimensions.map((row) => row.id))).toEqual(
      new Set(["inventory/reservation.drop", "warehouse/reservation.drop"]),
    );
  });

  test("rejects noncanonical aliases and conflicting operation spellings", () => {
    const aliasMutations: ReadonlyArray<(input: JsonRecord) => void> = [
      (input) => {
        const reserve = inventoryFunction(input, "reserve");
        (reserve.params as JsonRecord[])[0]!.type = { kind: "list", item: "string" };
      },
      (input) => {
        const reserve = inventoryFunction(input, "reserve");
        (reserve.params as JsonRecord[])[0]!.type = { kind: "list", of: "string" };
      },
      (input) => {
        const reserve = inventoryFunction(input, "reserve");
        reserve.result = { kind: "result", ok_type: "reservation", err: "inventory-error" };
      },
      (input) => {
        const reserve = inventoryFunction(input, "reserve");
        reserve.result = { kind: "result", ok: "reservation", error: "inventory-error" };
      },
      (input) => {
        const reserve = inventoryFunction(input, "reserve");
        reserve.result = { kind: "result", ok: "reservation", err_type: "inventory-error" };
      },
      (input) => {
        const watch = inventoryFunction(input, "watch");
        (watch.result as JsonRecord).items = (watch.result as JsonRecord).elements;
        delete (watch.result as JsonRecord).elements;
      },
      (input) => {
        const release = inventoryFunction(input, "release");
        (release.params as JsonRecord[])[0]!.type = { kind: "borrow", name: "reservation" };
      },
      (input) => {
        inventoryDeclaration(input, "variant").constructors = [];
      },
      (input) => {
        inventoryDeclaration(input, "enum").values = [];
      },
      (input) => {
        inventoryDeclaration(input, "flags").flags = [];
      },
      (input) => {
        inventoryDeclaration(input, "type").target = "string";
      },
      (input) => {
        inventoryDeclaration(input, "resource").ownership = "legacy ownership";
      },
      (input) => {
        inventoryDeclaration(input, "resource").static_functions = [];
      },
      (input) => {
        inventoryInterface(input).declarations = [];
      },
      (input) => {
        inventoryInterface(input).operations = [];
      },
      (input) => {
        ((input.theory as JsonRecord).laws as JsonRecord[])[0]!.claim = "legacy claim";
      },
      (input) => {
        ((input.theory as JsonRecord).laws as JsonRecord[])[0]!.description = "legacy description";
      },
      (input) => {
        inventoryFunction(input, "reserve").static = true;
      },
      (input) => {
        inventoryFunction(input, "reserve").mode = "async";
      },
      (input) => {
        inventoryFunction(input, "reserve").kind = "static";
      },
      (input) => {
        inventoryFunction(input, "reserve").parameters = [];
      },
      (input) => {
        inventoryFunction(input, "reserve").returns = "reservation";
      },
      (input) => {
        const resource = inventoryDeclaration(input, "resource");
        (resource["constructor"] as JsonRecord).parameters = [];
      },
    ];
    for (const mutate of aliasMutations) {
      const input = structuredClone(fixture) as JsonRecord;
      mutate(input);
      expect(diagnosticCode(input)).toBe("input.unknown-property");
    }

    const aliasKind = structuredClone(fixture) as JsonRecord;
    inventoryDeclaration(aliasKind, "type").kind = "alias";
    expect(diagnosticCode(aliasKind)).toBe("type.unsupported");

    const asyncConflict = structuredClone(fixture) as JsonRecord;
    const reserve = inventoryFunction(asyncConflict, "reserve");
    reserve.async = false;
    reserve.mode = "async";
    expect(diagnosticCode(asyncConflict)).toBe("input.unknown-property");
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
  test("rejects unescaped error-context and empty enum or variant declarations", () => {
    const reserved = structuredClone(fixture) as JsonRecord;
    inventoryDeclaration(reserved, "type").name = "error-context";
    expect(diagnosticCode(reserved)).toBe("name.invalid");

    for (const kind of ["enum", "variant"]) {
      const input = structuredClone(fixture) as JsonRecord;
      inventoryDeclaration(input, kind).cases = [];
      expect(diagnosticCode(input)).toBe("type.invalid");
    }
  });
  test("rejects recursive and unbounded integer types with typed diagnostics", () => {
    const recursive = structuredClone(fixture) as JsonRecord;
    inventoryDeclaration(recursive, "type").type = "reservation-id";
    expect(diagnosticCode(recursive)).toBe("type.unrestricted-recursive");

    const unbounded = structuredClone(fixture) as JsonRecord;
    const reserve = inventoryFunction(unbounded, "reserve");
    (reserve.params as JsonRecord[])[0]!.type = "number";
    expect(diagnosticCode(unbounded)).toBe("type.unsupported");
  });
});
