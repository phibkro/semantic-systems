import { Crypto, Effect } from "effect";
import { encodeWitMappingManifest } from "./canonical.ts";
import {
  UNSUPPORTED_CLAIMS,
  WitMappingError,
  type PortableBoundaryInput,
  type SemanticDimensionKind,
  type SemanticDimensionRow,
  type SemanticWitMappingManifestV1,
  type TheoryDeclaration,
  type WitInterface,
  type WitMappingArtifact,
  type WitMappingBounds,
  type WitMappingProjection,
  type WitMappingRow,
  type WitOperation,
  type WitParameter,
  type WitType,
  type WitTypeDeclaration,
} from "./schema.ts";
import { defaultWitMappingBounds, WIT_MAPPING_FORMAT } from "./schema.ts";

const compareCodePoints = (left: string, right: string): number => {
  const leftPoints = Array.from(left, (character) => character.codePointAt(0)!);
  const rightPoints = Array.from(right, (character) => character.codePointAt(0)!);
  const length = Math.min(leftPoints.length, rightPoints.length);
  for (let index = 0; index < length; index += 1) {
    const difference = leftPoints[index]! - rightPoints[index]!;
    if (difference !== 0) return difference;
  }
  return leftPoints.length - rightPoints.length;
};

const compareByName = <Value extends { readonly name: string }>(
  left: Value,
  right: Value,
): number => compareCodePoints(left.name, right.name);

const freezeDeep = <Value>(value: Value): Value => {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) freezeDeep(child);
    Object.freeze(value);
  }
  return value;
};

const toHex = (bytes: Uint8Array): string => {
  let output = "";
  for (let index = 0; index < bytes.byteLength; index += 1)
    output += bytes[index]!.toString(16).padStart(2, "0");
  return output;
};

const projectionForOperation = (operation: WitOperation): WitMappingProjection =>
  operation.async ||
  operation.params.some((parameter) => containsAsync(parameter.type)) ||
  (operation.result !== null && containsAsync(operation.result))
    ? "operational_async_shape"
    : "shape";

const containsAsync = (type: WitType): boolean => {
  switch (type.kind) {
    case "stream":
    case "future":
      return true;
    case "list":
    case "option":
      return containsAsync(type.element);
    case "result":
      return (
        (type.ok !== null && containsAsync(type.ok)) ||
        (type.err !== null && containsAsync(type.err))
      );
    case "tuple":
      return type.elements.some(containsAsync);
    default:
      return false;
  }
};

const renderType = (type: WitType): string => {
  switch (type.kind) {
    case "primitive":
      return type.name;
    case "list":
      return `list<${renderType(type.element)}>`;
    case "option":
      return `option<${renderType(type.element)}>`;
    case "result": {
      if (type.ok === null && type.err === null) return "result";
      if (type.err === null) return `result<${type.ok === null ? "_" : renderType(type.ok)}>`;
      return `result<${type.ok === null ? "_" : renderType(type.ok)}, ${renderType(type.err)}>`;
    }
    case "tuple":
      return `tuple<${type.elements.map(renderType).join(", ")}>`;
    case "named":
      return type.name;
    case "borrow":
      return `borrow<${type.name}>`;
    case "stream":
      return `stream<${renderType(type.element)}>`;
    case "future":
      return `future<${renderType(type.element)}>`;
  }
};

const renderParameters = (parameters: ReadonlyArray<WitParameter>): string =>
  parameters.map((parameter) => `${parameter.name}: ${renderType(parameter.type)}`).join(", ");

const renderOperation = (operation: WitOperation, resourceStatic = false): string => {
  const staticPrefix = resourceStatic ? "static " : "";
  const asyncPrefix = operation.async ? "async " : "";
  const result = operation.result === null ? "" : ` -> ${renderType(operation.result)}`;
  return `${operation.name}: ${staticPrefix}${asyncPrefix}func(${renderParameters(operation.params)})${result};`;
};

const renderTypeDeclaration = (declaration: WitTypeDeclaration): ReadonlyArray<string> => {
  switch (declaration.kind) {
    case "record":
      return [
        `record ${declaration.name} {`,
        ...declaration.fields.map((field) => `  ${field.name}: ${renderType(field.type)},`),
        "}",
      ];
    case "variant":
      return [
        `variant ${declaration.name} {`,
        ...declaration.cases.map(
          (entry) => `  ${entry.name}${entry.type === null ? "" : `(${renderType(entry.type)})`},`,
        ),
        "}",
      ];
    case "enum":
      return [
        `enum ${declaration.name} {`,
        ...declaration.cases.map((entry) => `  ${entry.name},`),
        "}",
      ];
    case "flags":
      return [
        `flags ${declaration.name} {`,
        ...declaration.cases.map((entry) => `  ${entry.name},`),
        "}",
      ];
    case "type":
      return [`type ${declaration.name} = ${renderType(declaration.type)};`];
    case "resource": {
      const lines = [`resource ${declaration.name} {`];
      if (declaration.constructor !== null)
        lines.push(`  constructor(${renderParameters(declaration.constructor.params)});`);
      for (const operation of [...declaration.methods].sort(compareByName))
        lines.push(`  ${renderOperation(operation)}`);
      for (const operation of [...declaration.statics].sort(compareByName))
        lines.push(`  ${renderOperation(operation, true)}`);
      lines.push("}");
      return lines;
    }
  }
};

const renderInterface = (interfaceValue: WitInterface): ReadonlyArray<string> => {
  const lines = [`interface ${interfaceValue.name} {`];
  const declarations = [...interfaceValue.types].sort(compareByName);
  const functions = [...interfaceValue.functions].sort(compareByName);
  for (let index = 0; index < declarations.length; index += 1) {
    const declaration = renderTypeDeclaration(declarations[index]!);
    for (const line of declaration) lines.push(`  ${line}`);
    if (index !== declarations.length - 1 || functions.length > 0) lines.push("");
  }
  for (let index = 0; index < functions.length; index += 1) {
    lines.push(`  ${renderOperation(functions[index]!)}`);
    if (index !== functions.length - 1) lines.push("");
  }
  lines.push("}");
  return lines;
};

export const renderCanonicalWit = (input: PortableBoundaryInput): string => {
  const lines: string[] = [
    `package ${input.package.namespace}:${input.package.name}@${input.package.version};`,
    "",
  ];
  const interfaces = [...input.interfaces].sort(compareByName);
  for (let index = 0; index < interfaces.length; index += 1) {
    lines.push(...renderInterface(interfaces[index]!));
    lines.push("");
  }
  lines.push(`world ${input.world.name} {`);
  for (const interfaceName of [...input.world.imports].sort(compareCodePoints))
    lines.push(`  import ${interfaceName};`);
  if (input.world.imports.length > 0 && input.world.exports.length > 0) lines.push("");
  for (const interfaceName of [...input.world.exports].sort(compareCodePoints))
    lines.push(`  export ${interfaceName};`);
  lines.push("}", "");
  return lines.join("\n");
};

const pathForInterface = (interfaceValue: WitInterface): string =>
  `interface/${interfaceValue.name}`;
const pathForType = (interfaceValue: WitInterface, declaration: WitTypeDeclaration): string =>
  `${pathForInterface(interfaceValue)}/type/${declaration.name}`;

const mapRow = (
  wit_path: string,
  semantic_path: string,
  projection: WitMappingProjection,
  detail?: string,
): WitMappingRow =>
  detail === undefined
    ? { wit_path, semantic_path, projection }
    : { wit_path, semantic_path, projection, detail };

const collectTypeRows = (
  interfaceValue: WitInterface,
  declaration: WitTypeDeclaration,
  rows: WitMappingRow[],
  resourceNames: ReadonlySet<string>,
): void => {
  const base = pathForType(interfaceValue, declaration);
  rows.push(
    mapRow(
      base,
      declaration.semantic_path,
      declaration.kind === "resource" ? "ownership_boundary" : "shape",
      declaration.kind === "resource" ? declaration.ownership_statement : undefined,
    ),
  );
  if (declaration.kind === "record") {
    for (const field of declaration.fields)
      rows.push(mapRow(`${base}/field/${field.name}`, field.semantic_path, "shape"));
  } else if (
    declaration.kind === "variant" ||
    declaration.kind === "enum" ||
    declaration.kind === "flags"
  ) {
    for (const entry of declaration.cases)
      rows.push(mapRow(`${base}/case/${entry.name}`, entry.semantic_path, "shape"));
  } else if (declaration.kind === "resource") {
    if (declaration.constructor !== null) {
      rows.push(
        mapRow(
          `${base}/constructor`,
          declaration.constructor.semantic_path,
          "ownership_boundary",
          "constructor transfers an owned handle",
        ),
      );
      for (const parameter of declaration.constructor.params)
        collectTypeUseRows(
          `${base}/constructor`,
          declaration.constructor.semantic_path,
          parameter,
          rows,
          resourceNames,
        );
    }
    for (const operation of declaration.methods)
      collectOperationRows(`${base}/method/${operation.name}`, operation, rows, resourceNames);
    for (const operation of declaration.statics)
      collectOperationRows(`${base}/static/${operation.name}`, operation, rows, resourceNames);
    if (declaration.usage_grade !== null)
      rows.push(
        mapRow(
          `${base}/usage-grade`,
          `${declaration.semantic_path}/usage-grade`,
          "companion_only",
          declaration.usage_grade,
        ),
      );
    rows.push(
      mapRow(
        `${base}/drop-assumption`,
        `${declaration.semantic_path}/drop-assumption`,
        "companion_only",
        declaration.drop_assumption,
      ),
    );
  }
};

const collectTypeUseRows = (
  base: string,
  semanticBase: string,
  parameter: WitParameter,
  rows: WitMappingRow[],
  resourceNames: ReadonlySet<string>,
): void => {
  const type = parameter.type;
  const parameterSemanticBase =
    parameter.semantic_path.length > 0
      ? parameter.semantic_path
      : `${semanticBase}/param/${parameter.name}`;
  if (type.kind === "borrow")
    rows.push(
      mapRow(
        `${base}/param/${parameter.name}`,
        parameterSemanticBase,
        "ownership_boundary",
        `borrow<${type.name}> temporary handle`,
      ),
    );
  else if (type.kind === "named" && resourceNames.has(type.name))
    rows.push(
      mapRow(
        `${base}/param/${parameter.name}`,
        parameterSemanticBase,
        "ownership_boundary",
        `${type.name} owned handle`,
      ),
    );
  if (
    type.kind === "list" ||
    type.kind === "option" ||
    type.kind === "stream" ||
    type.kind === "future"
  )
    collectNestedTypeUseRows(
      `${base}/param/${parameter.name}`,
      type.element,
      rows,
      resourceNames,
      parameterSemanticBase,
    );
  else if (type.kind === "result") {
    if (type.ok !== null)
      collectNestedTypeUseRows(
        `${base}/param/${parameter.name}/ok`,
        type.ok,
        rows,
        resourceNames,
        `${parameterSemanticBase}/ok`,
      );
    if (type.err !== null)
      collectNestedTypeUseRows(
        `${base}/param/${parameter.name}/err`,
        type.err,
        rows,
        resourceNames,
        `${parameterSemanticBase}/err`,
      );
  } else if (type.kind === "tuple") {
    for (let index = 0; index < type.elements.length; index += 1)
      collectNestedTypeUseRows(
        `${base}/param/${parameter.name}/${index}`,
        type.elements[index]!,
        rows,
        resourceNames,
        `${parameterSemanticBase}/${index}`,
      );
  }
};

const collectNestedTypeUseRows = (
  base: string,
  type: WitType,
  rows: WitMappingRow[],
  resourceNames: ReadonlySet<string>,
  semanticBase: string,
): void => {
  if (type.kind === "borrow")
    rows.push(
      mapRow(base, semanticBase, "ownership_boundary", `borrow<${type.name}> temporary handle`),
    );
  else if (type.kind === "named" && resourceNames.has(type.name))
    rows.push(mapRow(base, semanticBase, "ownership_boundary", `${type.name} owned handle`));
  else if (
    type.kind === "list" ||
    type.kind === "option" ||
    type.kind === "stream" ||
    type.kind === "future"
  )
    collectNestedTypeUseRows(
      `${base}/element`,
      type.element,
      rows,
      resourceNames,
      `${semanticBase}/element`,
    );
  else if (type.kind === "result") {
    if (type.ok !== null)
      collectNestedTypeUseRows(`${base}/ok`, type.ok, rows, resourceNames, `${semanticBase}/ok`);
    if (type.err !== null)
      collectNestedTypeUseRows(`${base}/err`, type.err, rows, resourceNames, `${semanticBase}/err`);
  } else if (type.kind === "tuple")
    for (let index = 0; index < type.elements.length; index += 1)
      collectNestedTypeUseRows(
        `${base}/${index}`,
        type.elements[index]!,
        rows,
        resourceNames,
        `${semanticBase}/${index}`,
      );
};

const collectOperationRows = (
  base: string,
  operation: WitOperation,
  rows: WitMappingRow[],
  resourceNames: ReadonlySet<string>,
): void => {
  rows.push(mapRow(base, operation.semantic_path, projectionForOperation(operation)));
  for (const parameter of operation.params)
    collectTypeUseRows(base, operation.semantic_path, parameter, rows, resourceNames);
  if (operation.result !== null)
    collectNestedTypeUseRows(
      `${base}/result`,
      operation.result,
      rows,
      resourceNames,
      `${operation.semantic_path}/result`,
    );
};

const uniqueDeclarations = (
  values: ReadonlyArray<TheoryDeclaration>,
): ReadonlyArray<TheoryDeclaration> => {
  const byId = new Map<string, TheoryDeclaration>();
  for (const value of values) if (!byId.has(value.id)) byId.set(value.id, value);
  return [...byId.values()].sort((left, right) => compareCodePoints(left.id, right.id));
};

const dimensionPath = (
  input: PortableBoundaryInput,
  kind: SemanticDimensionKind,
  id: string,
): string => `${input.theory.source_key}/${kind}/${id}`;

const dimensionRow = (
  input: PortableBoundaryInput,
  kind: SemanticDimensionKind,
  declaration: TheoryDeclaration,
  projection: WitMappingProjection,
  wit_path: string | null,
): SemanticDimensionRow => ({
  kind,
  id: declaration.id,
  statement: declaration.statement,
  projection,
  wit_path,
  semantic_path: dimensionPath(input, kind, declaration.id),
});

const collectManifest = (
  input: PortableBoundaryInput,
  wit_identity: `sha256:${string}`,
): SemanticWitMappingManifestV1 => {
  const rows: WitMappingRow[] = [
    mapRow(`world/${input.world.name}`, input.theory.source_key, "shape"),
  ];
  const imported = new Set(input.world.imports);
  const exported = new Set(input.world.exports);
  const operationEffectPaths = new Map<string, string>();
  const operationEffectLabels = new Set<string>();
  const sortedInterfaces = [...input.interfaces].sort(compareByName);
  for (const interfaceValue of sortedInterfaces) {
    const resourceNames = new Set(
      interfaceValue.types
        .filter((declaration) => declaration.kind === "resource")
        .map((declaration) => declaration.name),
    );
    const interfacePath = pathForInterface(interfaceValue);
    rows.push(mapRow(interfacePath, interfaceValue.semantic_path, "shape"));
    if (imported.has(interfaceValue.name))
      rows.push(
        mapRow(
          `world/${input.world.name}/import/${interfaceValue.name}`,
          interfaceValue.semantic_path,
          "capability_boundary",
        ),
      );
    if (exported.has(interfaceValue.name))
      rows.push(
        mapRow(
          `world/${input.world.name}/export/${interfaceValue.name}`,
          interfaceValue.semantic_path,
          "capability_boundary",
        ),
      );
    for (const declaration of interfaceValue.types)
      collectTypeRows(interfaceValue, declaration, rows, resourceNames);
    for (const operation of interfaceValue.functions) {
      collectOperationRows(
        `${interfacePath}/function/${operation.name}`,
        operation,
        rows,
        resourceNames,
      );
      for (const label of operation.effect_labels) {
        operationEffectLabels.add(label);
        if (imported.has(interfaceValue.name) && !operationEffectPaths.has(label))
          operationEffectPaths.set(
            label,
            `world/${input.world.name}/import/${interfaceValue.name}`,
          );
      }
    }
    for (const declaration of interfaceValue.types)
      if (declaration.kind === "resource") {
        for (const operation of [...declaration.methods, ...declaration.statics])
          for (const label of operation.effect_labels) {
            operationEffectLabels.add(label);
            if (imported.has(interfaceValue.name) && !operationEffectPaths.has(label))
              operationEffectPaths.set(
                label,
                `world/${input.world.name}/import/${interfaceValue.name}`,
              );
          }
        if (declaration.constructor !== null)
          for (const label of declaration.constructor.effect_labels) {
            operationEffectLabels.add(label);
            if (imported.has(interfaceValue.name) && !operationEffectPaths.has(label))
              operationEffectPaths.set(
                label,
                `world/${input.world.name}/import/${interfaceValue.name}`,
              );
          }
      }
  }
  const laws = uniqueDeclarations(input.theory.laws);
  const effects = uniqueDeclarations([
    ...input.theory.effect_labels,
    ...[...operationEffectLabels].map((id) => ({ id, statement: id })),
  ]);
  const resourceGrades: TheoryDeclaration[] = [];
  const resourceAssumptions: TheoryDeclaration[] = [];
  for (const interfaceValue of sortedInterfaces)
    for (const declaration of interfaceValue.types)
      if (declaration.kind === "resource") {
        if (declaration.usage_grade !== null)
          resourceGrades.push({ id: declaration.usage_grade, statement: declaration.usage_grade });
        resourceAssumptions.push({
          id: `${interfaceValue.name}/${declaration.name}.drop`,
          statement: declaration.drop_assumption,
        });
      }
  const grades = uniqueDeclarations([...input.theory.usage_grades, ...resourceGrades]);
  const assumptions = uniqueDeclarations([...input.theory.assumptions, ...resourceAssumptions]);
  const evidence = uniqueDeclarations(input.theory.evidence_requirements);
  const dimensions: SemanticDimensionRow[] = [];
  for (const [id, wit_path] of operationEffectPaths)
    rows.push(
      mapRow(
        `${wit_path}/effect/${id}`,
        dimensionPath(input, "effect_label", id),
        "capability_boundary",
      ),
    );
  for (const law of laws) dimensions.push(dimensionRow(input, "law", law, "companion_only", null));
  for (const effect of effects)
    dimensions.push(dimensionRow(input, "effect_label", effect, "companion_only", null));
  for (const grade of grades)
    dimensions.push(dimensionRow(input, "usage_grade", grade, "companion_only", null));
  for (const assumption of assumptions)
    dimensions.push(dimensionRow(input, "assumption", assumption, "companion_only", null));
  for (const requirement of evidence)
    dimensions.push(
      dimensionRow(input, "evidence_requirement", requirement, "companion_only", null),
    );
  rows.sort(
    (left, right) =>
      compareCodePoints(left.wit_path, right.wit_path) ||
      compareCodePoints(left.semantic_path, right.semantic_path),
  );
  dimensions.sort(
    (left, right) =>
      compareCodePoints(left.kind, right.kind) || compareCodePoints(left.id, right.id),
  );
  return freezeDeep({
    format: WIT_MAPPING_FORMAT,
    theory_identity: input.theory.identity,
    complete_contract_identity: input.theory.complete_contract_identity,
    theory_source_key: input.theory.source_key,
    wit_identity,
    package: input.package,
    world: {
      name: input.world.name,
      imports: [...input.world.imports].sort(compareCodePoints),
      exports: [...input.world.exports].sort(compareCodePoints),
    },
    mappings: rows,
    semantic_dimensions: dimensions,
    assumptions,
    evidence_requirements: evidence,
    unsupported_claims: [...UNSUPPORTED_CLAIMS],
  });
};

const digest = (
  crypto: Crypto.Crypto,
  bytes: Uint8Array,
  path: string,
): Effect.Effect<`sha256:${string}`, WitMappingError> =>
  crypto.digest("SHA-256", bytes).pipe(
    Effect.flatMap((digestBytes) =>
      digestBytes.byteLength === 32
        ? Effect.succeed(`sha256:${toHex(digestBytes)}` as `sha256:${string}`)
        : Effect.fail(
            new WitMappingError({
              code: "identity.invalid-digest",
              path,
              message: "Crypto returned a digest other than 32 bytes",
              cause: { byteLength: digestBytes.byteLength },
            }),
          ),
    ),
    Effect.mapError((cause) =>
      cause instanceof WitMappingError
        ? cause
        : new WitMappingError({
            code: "identity.digest-failed",
            path,
            message: "Crypto could not compute SHA-256",
            cause,
          }),
    ),
  );

const validateOutputSize = (
  bytes: Uint8Array,
  maximum: number,
  path: string,
): Effect.Effect<void, WitMappingError> =>
  bytes.byteLength <= maximum
    ? Effect.void
    : Effect.fail(
        new WitMappingError({
          code: "output.too-large",
          path,
          message: `output exceeds maximum ${maximum} bytes`,
        }),
      );

export const generateWitMapping = (
  input: PortableBoundaryInput,
  bounds: WitMappingBounds = defaultWitMappingBounds,
): Effect.Effect<WitMappingArtifact, WitMappingError, Crypto.Crypto> =>
  Effect.gen(function* () {
    const wit = yield* Effect.try({
      try: () => renderCanonicalWit(input),
      catch: (cause) =>
        new WitMappingError({
          code: "wit.render-failed",
          path: "/",
          message: "cannot render WIT",
          cause,
        }),
    });
    const witBytes = new TextEncoder().encode(wit);
    yield* validateOutputSize(witBytes, bounds.maximum_wit_bytes, "/wit");
    const crypto = yield* Crypto.Crypto;
    const wit_identity = yield* digest(crypto, witBytes, "/wit_identity");
    const manifest = collectManifest(input, wit_identity);
    const manifestBytes = yield* Effect.try({
      try: () => encodeWitMappingManifest(manifest),
      catch: (cause) =>
        new WitMappingError({
          code: "manifest.encode-failed",
          path: "/manifest",
          message: "cannot encode canonical manifest",
          cause,
        }),
    });
    yield* validateOutputSize(manifestBytes, bounds.maximum_manifest_bytes, "/manifest");
    const manifest_identity = yield* digest(crypto, manifestBytes, "/manifest_identity");
    return Object.freeze({ wit, manifest, wit_identity, manifest_identity });
  });
