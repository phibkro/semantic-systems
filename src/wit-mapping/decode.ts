import {
  WIT_MAPPING_INPUT_FORMAT,
  WIT_PRIMITIVES,
  defaultWitMappingBounds,
  decoded,
  diagnostic,
  rejected,
  type PortableBoundaryInput,
  type TheoryDeclaration,
  type WitConstructor,
  type WitInterface,
  type WitMappingBounds,
  type WitMappingDecodeResult,
  type WitMappingDiagnostic,
  type WitOperation,
  type WitParameter,
  type WitType,
  type WitTypeDeclaration,
  type WitWorld,
} from "./schema.ts";
import type { WitPrimitive } from "./schema.ts";

const MAX_BOUND_NAMES = [
  "maximum_interfaces",
  "maximum_types",
  "maximum_functions",
  "maximum_fields_or_cases",
  "maximum_depth",
  "maximum_string_length",
  "maximum_wit_bytes",
  "maximum_manifest_bytes",
] as const;

type UnknownRecord = Record<string, unknown>;

class DecodeStop {
  readonly issue: WitMappingDiagnostic;

  constructor(issue: WitMappingDiagnostic) {
    this.issue = issue;
  }
}

const freezeDeep = <Value>(value: Value): Value => {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as UnknownRecord)) freezeDeep(child);
    Object.freeze(value);
  }
  return value;
};

const isRecord = (value: unknown): value is UnknownRecord => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

const scalarLength = (value: string): number | undefined => {
  let count = 0;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (next < 0xdc00 || next > 0xdfff) return undefined;
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return undefined;
    }
    count += 1;
  }
  return count;
};

const identifierPattern = /^[A-Za-z][A-Za-z0-9]*(?:-[A-Za-z0-9]+)*$/;
const packagePattern = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const versionPattern = /^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const identityPattern = /^sha256:[0-9a-f]{64}$/;
const reservedIdentifiers = new Set([
  "as",
  "async",
  "bool",
  "borrow",
  "char",
  "constructor",
  "enum",
  "export",
  "f32",
  "f64",
  "flags",
  "future",
  "from",
  "func",
  "import",
  "include",
  "interface",
  "list",
  "map",
  "option",
  "own",
  "package",
  "record",
  "result",
  "resource",
  "s8",
  "s16",
  "s32",
  "s64",
  "static",
  "stream",
  "string",
  "tuple",
  "type",
  "u8",
  "u16",
  "u32",
  "u64",
  "use",
  "variant",
  "with",
  "world",
]);

const ownKeys = (value: UnknownRecord): ReadonlyArray<string> => Object.keys(value);

const hasOnly = (value: UnknownRecord, allowed: ReadonlySet<string>, path: string): void => {
  for (const key of ownKeys(value)) {
    if (!allowed.has(key))
      fail(
        "input.unknown-property",
        `${path}/${key}`,
        "property is not part of the closed descriptor",
      );
  }
};

const requireRecord = (value: unknown, path: string): UnknownRecord => {
  if (!isRecord(value)) return fail("input.expected-object", path, "expected a plain object");
  return value;
};

const requireArray = (value: unknown, path: string): ReadonlyArray<unknown> => {
  if (!Array.isArray(value)) return fail("input.expected-array", path, "expected an array");
  return value;
};

const requireString = (value: unknown, path: string, maximum: number): string => {
  if (typeof value !== "string") return fail("input.expected-string", path, "expected a string");
  const length = scalarLength(value);
  if (length === undefined)
    return fail("input.invalid-unicode", path, "string contains an unpaired UTF-16 surrogate");
  if (length > maximum)
    return fail(
      "input.string-too-long",
      path,
      `string exceeds maximum ${maximum} Unicode scalar values`,
    );
  return value;
};

const requireNonemptyString = (value: unknown, path: string, maximum: number): string => {
  const string = requireString(value, path, maximum);
  if (string.length === 0) fail("input.empty-string", path, "expected a non-empty string");
  return string;
};

const requireIdentifier = (value: unknown, path: string, maximum: number): string => {
  const identifier = requireNonemptyString(value, path, maximum);
  const words = identifier.split("-");
  if (
    !identifierPattern.test(identifier) ||
    words.some((word) => !/^(?:[a-z][a-z0-9]*|[A-Z][A-Z0-9]*)$/.test(word)) ||
    reservedIdentifiers.has(identifier.toLowerCase())
  ) {
    fail("name.invalid", path, "expected an existing ASCII kebab-case WIT identifier");
  }
  return identifier;
};

const requirePackagePart = (value: unknown, path: string, maximum: number): string => {
  const part = requireNonemptyString(value, path, maximum);
  if (!packagePattern.test(part))
    fail("package.invalid-identifier", path, "expected a lowercase WIT package identifier");
  return part;
};

const requireIdentity = (value: unknown, path: string, maximum: number): `sha256:${string}` => {
  const identity = requireString(value, path, maximum);
  if (!identityPattern.test(identity))
    fail("identity.invalid", path, "expected sha256 followed by 64 lowercase hexadecimal digits");
  return identity as `sha256:${string}`;
};

const optionalString = (value: unknown, path: string, maximum: number): string | undefined =>
  value === undefined ? undefined : requireString(value, path, maximum);

const property = (value: UnknownRecord, key: string, path: string): unknown => {
  if (!Object.prototype.hasOwnProperty.call(value, key))
    fail("input.missing-property", `${path}/${key}`, "required property is missing");
  return value[key];
};

const optionalProperty = (value: UnknownRecord, key: string): unknown =>
  Object.prototype.hasOwnProperty.call(value, key) ? value[key] : undefined;

const parseBounds = (input: Partial<WitMappingBounds> | undefined): WitMappingBounds => {
  if (input === undefined) return defaultWitMappingBounds;
  const value = requireRecord(input, "/bounds");
  hasOnly(value, new Set(MAX_BOUND_NAMES), "/bounds");
  const result = { ...defaultWitMappingBounds };
  for (const name of MAX_BOUND_NAMES) {
    if (!Object.prototype.hasOwnProperty.call(value, name)) continue;
    const candidate = value[name];
    if (typeof candidate !== "number" || !Number.isSafeInteger(candidate) || candidate <= 0) {
      return fail("bounds.invalid", `/bounds/${name}`, "bound must be a positive safe integer");
    }
    if (candidate > defaultWitMappingBounds[name]) {
      return fail(
        "bounds.too-large",
        `/bounds/${name}`,
        `bound cannot exceed ${defaultWitMappingBounds[name]}`,
      );
    }
    result[name] = candidate;
  }
  return Object.freeze(result);
};

const parseTheoryDeclaration = (
  input: unknown,
  path: string,
  maximum: number,
): TheoryDeclaration => {
  if (typeof input === "string") {
    const id = requireNonemptyString(input, path, maximum);
    return Object.freeze({ id, statement: id });
  }
  const value = requireRecord(input, path);
  hasOnly(value, new Set(["id", "statement"]), path);
  const id = requireNonemptyString(property(value, "id", path), `${path}/id`, maximum);
  const statementValue = optionalProperty(value, "statement");
  const statement = requireNonemptyString(statementValue ?? id, `${path}/statement`, maximum);
  return Object.freeze({ id, statement });
};

const parseDeclarations = (
  input: unknown,
  path: string,
  maximum: number,
  maximumString: number,
): ReadonlyArray<TheoryDeclaration> => {
  const entries = requireArray(input, path);
  if (entries.length > maximum)
    fail("bounds.collection-too-large", path, `collection exceeds maximum ${maximum}`);
  const result = entries.map((entry, index) =>
    parseTheoryDeclaration(entry, `${path}/${index}`, maximumString),
  );
  const ids = new Set<string>();
  for (let index = 0; index < result.length; index += 1) {
    const id = result[index]!.id;
    if (ids.has(id))
      fail("input.duplicate-id", `${path}/${index}/id`, `duplicate declaration id '${id}'`);
    ids.add(id);
  }
  return Object.freeze(result);
};

const splitGeneric = (
  value: string,
  path: string,
): { readonly name: string; readonly arguments: ReadonlyArray<string> } | undefined => {
  const open = value.indexOf("<");
  if (open < 0) return undefined;
  if (!value.endsWith(">"))
    fail("type.invalid-string", path, "generic type string must end with '>'");
  const name = value.slice(0, open);
  const body = value.slice(open + 1, -1);
  const parts: string[] = [];
  let start = 0;
  let depth = 0;
  for (let index = 0; index < body.length; index += 1) {
    const character = body[index]!;
    if (character === "<") depth += 1;
    else if (character === ">") {
      depth -= 1;
      if (depth < 0)
        fail("type.invalid-string", path, "generic type has unbalanced angle brackets");
    } else if (character === "," && depth === 0) {
      parts.push(body.slice(start, index).trim());
      start = index + 1;
    }
  }
  if (depth !== 0) fail("type.invalid-string", path, "generic type has unbalanced angle brackets");
  parts.push(body.slice(start).trim());
  if (parts.some((part) => part.length === 0))
    fail("type.invalid-string", path, "generic type has an empty argument");
  return { name, arguments: parts };
};

const parseType = (
  input: unknown,
  path: string,
  depth: number,
  bounds: WitMappingBounds,
): WitType => {
  if (depth > bounds.maximum_depth)
    fail("bounds.depth-exceeded", path, `type nesting exceeds maximum ${bounds.maximum_depth}`);
  if (typeof input === "string") {
    const text = requireNonemptyString(input, path, bounds.maximum_string_length);
    if ((WIT_PRIMITIVES as readonly string[]).includes(text)) {
      return Object.freeze({ kind: "primitive", name: text as WitPrimitive });
    }
    if (text === "_" || text === "int" || text === "integer" || text === "number") {
      fail(
        "type.unsupported",
        path,
        "unbounded or unit-like integer type is not in the portable subset",
      );
    }
    const generic = splitGeneric(text, path);
    if (generic !== undefined) {
      if (generic.name === "borrow" && generic.arguments.length === 1) {
        return Object.freeze({
          kind: "borrow",
          name: requireIdentifier(
            generic.arguments[0],
            `${path}/name`,
            bounds.maximum_string_length,
          ),
        });
      }
      if (generic.name === "list" && generic.arguments.length === 1) {
        return Object.freeze({
          kind: "list",
          element: parseType(generic.arguments[0], `${path}/element`, depth + 1, bounds),
        });
      }
      if (generic.name === "option" && generic.arguments.length === 1) {
        return Object.freeze({
          kind: "option",
          element: parseType(generic.arguments[0], `${path}/element`, depth + 1, bounds),
        });
      }
      if (generic.name === "stream" && generic.arguments.length === 1) {
        return Object.freeze({
          kind: "stream",
          element: parseType(generic.arguments[0], `${path}/element`, depth + 1, bounds),
        });
      }
      if (generic.name === "future" && generic.arguments.length === 1) {
        return Object.freeze({
          kind: "future",
          element: parseType(generic.arguments[0], `${path}/element`, depth + 1, bounds),
        });
      }
      if (generic.name === "tuple" && generic.arguments.length >= 1) {
        return Object.freeze({
          kind: "tuple",
          elements: Object.freeze(
            generic.arguments.map((entry, index) =>
              parseType(entry, `${path}/elements/${index}`, depth + 1, bounds),
            ),
          ),
        });
      }
      if (
        generic.name === "result" &&
        (generic.arguments.length === 1 || generic.arguments.length === 2)
      ) {
        const ok =
          generic.arguments[0] === "_"
            ? null
            : parseType(generic.arguments[0], `${path}/ok`, depth + 1, bounds);
        const err =
          generic.arguments.length === 1 || generic.arguments[1] === "_"
            ? null
            : parseType(generic.arguments[1], `${path}/err`, depth + 1, bounds);
        return Object.freeze({ kind: "result", ok, err });
      }
      fail("type.unsupported", path, `unsupported generic type '${generic.name}'`);
    }
    if (!identifierPattern.test(text) || reservedIdentifiers.has(text.toLowerCase())) {
      fail("type.unsupported", path, `unsupported type '${text}'`);
    }
    return Object.freeze({ kind: "named", name: text });
  }

  const value = requireRecord(input, path);
  const kind = requireNonemptyString(
    property(value, "kind", path),
    `${path}/kind`,
    bounds.maximum_string_length,
  );
  switch (kind) {
    case "primitive": {
      hasOnly(value, new Set(["kind", "name"]), path);
      const name = requireString(
        property(value, "name", path),
        `${path}/name`,
        bounds.maximum_string_length,
      );
      if (!(WIT_PRIMITIVES as readonly string[]).includes(name))
        fail("type.unsupported", `${path}/name`, `unsupported primitive '${name}'`);
      return Object.freeze({ kind, name: name as WitPrimitive });
    }
    case "list":
    case "option":
    case "stream":
    case "future": {
      hasOnly(value, new Set(["kind", "element"]), path);
      const element = property(value, "element", path);
      return Object.freeze({
        kind,
        element: parseType(element, `${path}/element`, depth + 1, bounds),
      });
    }
    case "result": {
      hasOnly(value, new Set(["kind", "ok", "err"]), path);
      const okInput = optionalProperty(value, "ok");
      const errInput = optionalProperty(value, "err");
      if (okInput === undefined && errInput === undefined)
        fail("type.invalid", path, "result must declare an ok or error payload");
      const ok =
        okInput === undefined || okInput === null || okInput === "_"
          ? null
          : parseType(okInput, `${path}/ok`, depth + 1, bounds);
      const err =
        errInput === undefined || errInput === null || errInput === "_"
          ? null
          : parseType(errInput, `${path}/err`, depth + 1, bounds);
      return Object.freeze({ kind, ok, err });
    }
    case "tuple": {
      hasOnly(value, new Set(["kind", "elements"]), path);
      const entries = requireArray(property(value, "elements", path), `${path}/elements`);
      if (entries.length === 0)
        fail("type.invalid", `${path}/elements`, "tuple must contain at least one element");
      return Object.freeze({
        kind,
        elements: Object.freeze(
          entries.map((entry, index) =>
            parseType(entry, `${path}/elements/${index}`, depth + 1, bounds),
          ),
        ),
      });
    }
    case "named": {
      hasOnly(value, new Set(["kind", "name"]), path);
      const name = requireIdentifier(
        property(value, "name", path),
        `${path}/name`,
        bounds.maximum_string_length,
      );
      return Object.freeze({ kind, name });
    }
    case "resource": {
      hasOnly(value, new Set(["kind", "resource"]), path);
      const name = requireIdentifier(
        property(value, "resource", path),
        `${path}/resource`,
        bounds.maximum_string_length,
      );
      return Object.freeze({ kind: "named", name });
    }
    case "borrow": {
      hasOnly(value, new Set(["kind", "resource"]), path);
      const name = requireIdentifier(
        property(value, "resource", path),
        `${path}/resource`,
        bounds.maximum_string_length,
      );
      return Object.freeze({ kind, name });
    }
    default:
      return fail(
        "type.unsupported",
        `${path}/kind`,
        `unsupported type kind '${kind}' (thunks, higher-order functions, open rows, and unbounded integers are rejected)`,
      );
  }
};

const parseEffectLabels = (
  input: unknown,
  path: string,
  bounds: WitMappingBounds,
): ReadonlyArray<string> => {
  if (input === undefined) return Object.freeze([]);
  const entries = requireArray(input, path);
  if (entries.length > bounds.maximum_functions)
    fail("bounds.collection-too-large", path, "effect label collection is too large");
  const labels = entries.map((entry, index) =>
    requireNonemptyString(entry, `${path}/${index}`, bounds.maximum_string_length),
  );
  const unique = new Set<string>();
  for (let index = 0; index < labels.length; index += 1) {
    if (unique.has(labels[index]!))
      fail("input.duplicate-id", `${path}/${index}`, `duplicate effect label '${labels[index]}'`);
    unique.add(labels[index]!);
  }
  return Object.freeze(labels);
};

const parseParameter = (
  input: unknown,
  path: string,
  semanticParent: string,
  depth: number,
  bounds: WitMappingBounds,
): WitParameter => {
  const value = requireRecord(input, path);
  hasOnly(value, new Set(["name", "type", "semantic_path"]), path);
  const name = requireIdentifier(
    property(value, "name", path),
    `${path}/name`,
    bounds.maximum_string_length,
  );
  const semantic_path =
    optionalString(
      optionalProperty(value, "semantic_path"),
      `${path}/semantic_path`,
      bounds.maximum_string_length,
    ) ?? `${semanticParent}/${name}`;
  if (semantic_path.length === 0)
    fail("semantic-path.empty", `${path}/semantic_path`, "semantic path must be non-empty");
  return Object.freeze({
    name,
    type: parseType(property(value, "type", path), `${path}/type`, depth + 1, bounds),
    semantic_path,
  });
};

const parseParams = (
  value: UnknownRecord,
  path: string,
  semanticParent: string,
  depth: number,
  bounds: WitMappingBounds,
): ReadonlyArray<WitParameter> => {
  const direct = optionalProperty(value, "params");
  const alternate = optionalProperty(value, "parameters");
  if (direct !== undefined && alternate !== undefined)
    fail("input.duplicate-property", path, "use either 'params' or 'parameters', not both");
  const entries = requireArray(direct ?? alternate ?? [], `${path}/params`);
  if (entries.length > bounds.maximum_fields_or_cases)
    fail("bounds.collection-too-large", `${path}/params`, "parameter collection is too large");
  const result = entries.map((entry, index) =>
    parseParameter(entry, `${path}/params/${index}`, semanticParent, depth + 1, bounds),
  );
  const names = new Set<string>();
  for (let index = 0; index < result.length; index += 1) {
    if (names.has(result[index]!.name))
      fail("input.duplicate-name", `${path}/params/${index}/name`, "duplicate parameter name");
    names.add(result[index]!.name);
  }
  return Object.freeze(result);
};
const parseAsync = (value: UnknownRecord, path: string): boolean => {
  const asyncValue = optionalProperty(value, "async");
  if (asyncValue !== undefined && typeof asyncValue !== "boolean")
    fail("input.expected-boolean", `${path}/async`, "async must be boolean");
  return asyncValue === true;
};

const parseOperation = (
  input: unknown,
  path: string,
  semanticParent: string,
  depth: number,
  bounds: WitMappingBounds,
): WitOperation => {
  const value = requireRecord(input, path);
  hasOnly(
    value,
    new Set([
      "name",
      "semantic_path",
      "async",
      "params",
      "parameters",
      "result",
      "returns",
      "effect_labels",
    ]),
    path,
  );
  const name = requireIdentifier(
    property(value, "name", path),
    `${path}/name`,
    bounds.maximum_string_length,
  );
  const semantic_path =
    optionalString(
      optionalProperty(value, "semantic_path"),
      `${path}/semantic_path`,
      bounds.maximum_string_length,
    ) ?? `${semanticParent}/${name}`;
  const resultInput = optionalProperty(value, "result");
  const returnsInput = optionalProperty(value, "returns");
  if (resultInput !== undefined && returnsInput !== undefined)
    fail("input.duplicate-property", path, "use either 'result' or 'returns', not both");
  const resultValue = resultInput ?? returnsInput;
  const result =
    resultValue === undefined || resultValue === null || resultValue === "_"
      ? null
      : parseType(resultValue, `${path}/result`, depth + 1, bounds);
  const async = parseAsync(value, `${path}`);
  return Object.freeze({
    name,
    semantic_path,
    async,
    params: parseParams(value, path, semantic_path, depth + 1, bounds),
    result,
    effect_labels: parseEffectLabels(
      optionalProperty(value, "effect_labels"),
      `${path}/effect_labels`,
      bounds,
    ),
  });
};

const parseConstructor = (
  input: unknown,
  path: string,
  semanticParent: string,
  depth: number,
  bounds: WitMappingBounds,
): WitConstructor => {
  const value = requireRecord(input, path);
  hasOnly(value, new Set(["semantic_path", "params", "parameters", "effect_labels"]), path);
  const semantic_path =
    optionalString(
      optionalProperty(value, "semantic_path"),
      `${path}/semantic_path`,
      bounds.maximum_string_length,
    ) ?? `${semanticParent}/constructor`;
  return Object.freeze({
    semantic_path,
    params: parseParams(value, path, semantic_path, depth + 1, bounds),
    effect_labels: parseEffectLabels(
      optionalProperty(value, "effect_labels"),
      `${path}/effect_labels`,
      bounds,
    ),
  });
};

const parseCases = (
  input: unknown,
  path: string,
  semanticParent: string,
  depth: number,
  bounds: WitMappingBounds,
  withPayload: boolean,
): ReadonlyArray<{
  readonly name: string;
  readonly type: WitType | null;
  readonly semantic_path: string;
}> => {
  const entries = requireArray(input, path);
  if (entries.length > bounds.maximum_fields_or_cases)
    fail("bounds.collection-too-large", path, "case collection is too large");
  const result = entries.map((entry, index) => {
    if (typeof entry === "string") {
      const name = requireIdentifier(entry, `${path}/${index}`, bounds.maximum_string_length);
      return Object.freeze({ name, type: null, semantic_path: `${semanticParent}/${name}` });
    }
    const value = requireRecord(entry, `${path}/${index}`);
    hasOnly(
      value,
      withPayload ? new Set(["name", "type", "semantic_path"]) : new Set(["name", "semantic_path"]),
      `${path}/${index}`,
    );
    const name = requireIdentifier(
      property(value, "name", `${path}/${index}`),
      `${path}/${index}/name`,
      bounds.maximum_string_length,
    );
    const semantic_path =
      optionalString(
        optionalProperty(value, "semantic_path"),
        `${path}/${index}/semantic_path`,
        bounds.maximum_string_length,
      ) ?? `${semanticParent}/${name}`;
    const typeValue = optionalProperty(value, "type");
    const type =
      withPayload && typeValue !== undefined && typeValue !== null
        ? parseType(typeValue, `${path}/${index}/type`, depth + 1, bounds)
        : null;
    return Object.freeze({ name, type, semantic_path });
  });
  const names = new Set<string>();
  for (let index = 0; index < result.length; index += 1) {
    if (names.has(result[index]!.name))
      fail("input.duplicate-name", `${path}/${index}/name`, "duplicate case name");
    names.add(result[index]!.name);
  }
  return Object.freeze(result);
};

const parseTypeDeclaration = (
  input: unknown,
  path: string,
  semanticParent: string,
  depth: number,
  bounds: WitMappingBounds,
): WitTypeDeclaration => {
  const value = requireRecord(input, path);
  const rawKind = requireNonemptyString(
    property(value, "kind", path),
    `${path}/kind`,
    bounds.maximum_string_length,
  );
  const kind = rawKind;
  const name = requireIdentifier(
    property(value, "name", path),
    `${path}/name`,
    bounds.maximum_string_length,
  );
  const semantic_path =
    optionalString(
      optionalProperty(value, "semantic_path"),
      `${path}/semantic_path`,
      bounds.maximum_string_length,
    ) ?? `${semanticParent}/${name}`;
  switch (kind) {
    case "record": {
      hasOnly(value, new Set(["kind", "name", "semantic_path", "fields"]), path);
      const fields = requireArray(property(value, "fields", path), `${path}/fields`);
      if (fields.length > bounds.maximum_fields_or_cases)
        fail("bounds.collection-too-large", `${path}/fields`, "field collection is too large");
      const parsed = fields.map((entry, index) =>
        parseParameter(entry, `${path}/fields/${index}`, semantic_path, depth + 1, bounds),
      );
      const names = new Set<string>();
      for (let index = 0; index < parsed.length; index += 1) {
        if (names.has(parsed[index]!.name))
          fail("input.duplicate-name", `${path}/fields/${index}/name`, "duplicate field name");
        names.add(parsed[index]!.name);
      }
      return Object.freeze({ kind, name, semantic_path, fields: Object.freeze(parsed) });
    }
    case "variant": {
      hasOnly(value, new Set(["kind", "name", "semantic_path", "cases"]), path);
      return Object.freeze({
        kind,
        name,
        semantic_path,
        cases: parseCases(
          property(value, "cases", path),
          `${path}/cases`,
          semantic_path,
          depth + 1,
          bounds,
          true,
        ),
      });
    }
    case "enum": {
      hasOnly(value, new Set(["kind", "name", "semantic_path", "cases"]), path);
      return Object.freeze({
        kind,
        name,
        semantic_path,
        cases: parseCases(
          property(value, "cases", path),
          `${path}/cases`,
          semantic_path,
          depth + 1,
          bounds,
          false,
        ),
      });
    }
    case "flags": {
      hasOnly(value, new Set(["kind", "name", "semantic_path", "cases"]), path);
      return Object.freeze({
        kind,
        name,
        semantic_path,
        cases: parseCases(
          property(value, "cases", path),
          `${path}/cases`,
          semantic_path,
          depth + 1,
          bounds,
          false,
        ),
      });
    }
    case "type": {
      hasOnly(value, new Set(["kind", "name", "semantic_path", "type"]), path);
      return Object.freeze({
        kind,
        name,
        semantic_path,
        type: parseType(property(value, "type", path), `${path}/type`, depth + 1, bounds),
      });
    }
    case "resource": {
      hasOnly(
        value,
        new Set([
          "kind",
          "name",
          "semantic_path",
          "ownership_statement",
          "drop_assumption",
          "usage_grade",
          "constructor",
          "methods",
          "statics",
        ]),
        path,
      );
      const ownership = requireNonemptyString(
        property(value, "ownership_statement", path),
        `${path}/ownership_statement`,
        bounds.maximum_string_length,
      );
      const drop_assumption = requireNonemptyString(
        property(value, "drop_assumption", path),
        `${path}/drop_assumption`,
        bounds.maximum_string_length,
      );
      const usage_grade_value = optionalProperty(value, "usage_grade");
      const usage_grade =
        usage_grade_value === undefined || usage_grade_value === null
          ? null
          : requireNonemptyString(
              usage_grade_value,
              `${path}/usage_grade`,
              bounds.maximum_string_length,
            );
      const constructorInput = optionalProperty(value, "constructor");
      const methodsInput = optionalProperty(value, "methods") ?? [];
      const staticsInput = optionalProperty(value, "statics") ?? [];
      const methods = requireArray(methodsInput, `${path}/methods`);
      const statics = requireArray(staticsInput, `${path}/statics`);
      if (
        methods.length +
          statics.length +
          (constructorInput === undefined || constructorInput === null ? 0 : 1) >
        bounds.maximum_functions
      )
        fail("bounds.collection-too-large", path, "resource operation collection is too large");
      const parsedMethods = methods.map((entry, index) =>
        parseOperation(entry, `${path}/methods/${index}`, semantic_path, depth + 1, bounds),
      );
      const parsedStatics = statics.map((entry, index) =>
        parseOperation(entry, `${path}/statics/${index}`, semantic_path, depth + 1, bounds),
      );
      const names = new Set<string>();
      for (const [index, operation] of [...parsedMethods, ...parsedStatics].entries()) {
        if (names.has(operation.name))
          fail(
            "input.duplicate-name",
            `${path}/operations/${index}/name`,
            "duplicate resource operation name",
          );
        names.add(operation.name);
      }
      return Object.freeze({
        kind,
        name,
        semantic_path,
        ownership_statement: ownership,
        drop_assumption,
        usage_grade,
        constructor:
          constructorInput === undefined || constructorInput === null
            ? null
            : parseConstructor(
                constructorInput,
                `${path}/constructor`,
                semantic_path,
                depth + 1,
                bounds,
              ),
        methods: Object.freeze(parsedMethods),
        statics: Object.freeze(parsedStatics),
      });
    }
    default:
      return fail("type.unsupported", `${path}/kind`, `unsupported declaration kind '${rawKind}'`);
  }
};

const validateTypes = (interfaces: ReadonlyArray<WitInterface>): void => {
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const resolveName = (
    interfaceValue: WitInterface,
    name: string,
    path: string,
  ): WitTypeDeclaration => {
    const declaration = interfaceValue.types.find((entry) => entry.name === name);
    if (declaration === undefined)
      return fail(
        "type.unknown-reference",
        path,
        `unknown type '${name}' in interface '${interfaceValue.name}'`,
      );
    return declaration;
  };
  const visitType = (interfaceValue: WitInterface, type: WitType, path: string): void => {
    switch (type.kind) {
      case "primitive":
        return;
      case "list":
      case "option":
      case "stream":
      case "future":
        visitType(interfaceValue, type.element, path);
        return;
      case "result":
        if (type.ok !== null) visitType(interfaceValue, type.ok, `${path}/ok`);
        if (type.err !== null) visitType(interfaceValue, type.err, `${path}/err`);
        return;
      case "tuple":
        for (let index = 0; index < type.elements.length; index += 1)
          visitType(interfaceValue, type.elements[index]!, `${path}/elements/${index}`);
        return;
      case "borrow": {
        const declaration = resolveName(interfaceValue, type.name, path);
        if (declaration.kind !== "resource")
          fail("type.invalid-borrow", path, `borrow<${type.name}> requires a resource declaration`);
        return;
      }
      case "named": {
        const declaration = resolveName(interfaceValue, type.name, path);
        if (
          declaration.kind === "record" ||
          declaration.kind === "variant" ||
          declaration.kind === "type"
        ) {
          const key = `${interfaceValue.name}/${declaration.name}`;
          if (visiting.has(key))
            fail(
              "type.unrestricted-recursive",
              path,
              `recursive type '${type.name}' is not supported`,
            );
          if (visited.has(key)) return;
          visiting.add(key);
          if (declaration.kind === "record") {
            for (const field of declaration.fields)
              visitType(interfaceValue, field.type, `${path}/${field.name}`);
          } else if (declaration.kind === "variant") {
            for (const entry of declaration.cases) {
              if (entry.type !== null)
                visitType(interfaceValue, entry.type, `${path}/${entry.name}`);
            }
          } else {
            visitType(interfaceValue, declaration.type, `${path}/${declaration.name}`);
          }
          visiting.delete(key);
          visited.add(key);
        }
        return;
      }
    }
  };
  for (const interfaceValue of interfaces) {
    for (const declaration of interfaceValue.types) {
      if (declaration.kind === "record") {
        for (const field of declaration.fields)
          visitType(interfaceValue, field.type, `${declaration.semantic_path}/${field.name}`);
      } else if (declaration.kind === "variant") {
        for (const entry of declaration.cases) {
          if (entry.type !== null)
            visitType(interfaceValue, entry.type, `${declaration.semantic_path}/${entry.name}`);
        }
      } else if (declaration.kind === "type") {
        visitType(interfaceValue, declaration.type, declaration.semantic_path);
      } else if (declaration.kind === "resource") {
        if (declaration.constructor !== null) {
          for (const parameter of declaration.constructor.params)
            visitType(
              interfaceValue,
              parameter.type,
              `${declaration.semantic_path}/constructor/${parameter.name}`,
            );
        }
        for (const operation of [...declaration.methods, ...declaration.statics]) {
          for (const parameter of operation.params)
            visitType(
              interfaceValue,
              parameter.type,
              `${operation.semantic_path}/${parameter.name}`,
            );
          if (operation.result !== null)
            visitType(interfaceValue, operation.result, `${operation.semantic_path}/result`);
        }
      }
    }
    for (const operation of interfaceValue.functions) {
      for (const parameter of operation.params)
        visitType(interfaceValue, parameter.type, `${operation.semantic_path}/${parameter.name}`);
      if (operation.result !== null)
        visitType(interfaceValue, operation.result, `${operation.semantic_path}/result`);
    }
  }
};

const parseInterface = (input: unknown, path: string, bounds: WitMappingBounds): WitInterface => {
  const value = requireRecord(input, path);
  hasOnly(value, new Set(["name", "semantic_path", "types", "functions"]), path);
  const name = requireIdentifier(
    property(value, "name", path),
    `${path}/name`,
    bounds.maximum_string_length,
  );
  const semantic_path = requireNonemptyString(
    property(value, "semantic_path", path),
    `${path}/semantic_path`,
    bounds.maximum_string_length,
  );
  const typesInput = optionalProperty(value, "types") ?? [];
  const functionsInput = optionalProperty(value, "functions") ?? [];
  const typeEntries = requireArray(typesInput, `${path}/types`);
  const functionEntries = requireArray(functionsInput, `${path}/functions`);
  if (typeEntries.length > bounds.maximum_types)
    fail("bounds.collection-too-large", `${path}/types`, "type collection is too large");
  if (functionEntries.length > bounds.maximum_functions)
    fail("bounds.collection-too-large", `${path}/functions`, "function collection is too large");
  const types = typeEntries.map((entry, index) =>
    parseTypeDeclaration(entry, `${path}/types/${index}`, semantic_path, 1, bounds),
  );
  const functions = functionEntries.map((entry, index) =>
    parseOperation(entry, `${path}/functions/${index}`, semantic_path, 1, bounds),
  );
  const names = new Set<string>();
  for (let index = 0; index < types.length; index += 1) {
    if (names.has(types[index]!.name))
      fail(
        "input.duplicate-name",
        `${path}/types/${index}/name`,
        `duplicate declaration '${types[index]!.name}'`,
      );
    names.add(types[index]!.name);
  }
  for (let index = 0; index < functions.length; index += 1) {
    if (names.has(functions[index]!.name))
      fail(
        "input.duplicate-name",
        `${path}/functions/${index}/name`,
        `duplicate declaration '${functions[index]!.name}'`,
      );
    names.add(functions[index]!.name);
  }
  return Object.freeze({
    name,
    semantic_path,
    types: Object.freeze(types),
    functions: Object.freeze(functions),
  });
};

const parseWorld = (input: unknown, path: string, bounds: WitMappingBounds): WitWorld => {
  const value = requireRecord(input, path);
  hasOnly(value, new Set(["name", "imports", "exports"]), path);
  const name = requireIdentifier(
    property(value, "name", path),
    `${path}/name`,
    bounds.maximum_string_length,
  );
  const parseDirections = (direction: "imports" | "exports"): ReadonlyArray<string> => {
    const entries = requireArray(property(value, direction, path), `${path}/${direction}`);
    if (entries.length > bounds.maximum_interfaces)
      fail(
        "bounds.collection-too-large",
        `${path}/${direction}`,
        "world interface collection is too large",
      );
    const result = entries.map((entry, index) => {
      if (typeof entry === "string")
        return requireIdentifier(
          entry,
          `${path}/${direction}/${index}`,
          bounds.maximum_string_length,
        );
      const object = requireRecord(entry, `${path}/${direction}/${index}`);
      hasOnly(object, new Set(["interface", "name"]), `${path}/${direction}/${index}`);
      return requireIdentifier(
        optionalProperty(object, "interface") ?? optionalProperty(object, "name"),
        `${path}/${direction}/${index}/interface`,
        bounds.maximum_string_length,
      );
    });
    const names = new Set<string>();
    for (let index = 0; index < result.length; index += 1) {
      if (names.has(result[index]!))
        fail(
          "input.duplicate-name",
          `${path}/${direction}/${index}`,
          `duplicate world interface '${result[index]}'`,
        );
      names.add(result[index]!);
    }
    return Object.freeze(result);
  };
  return Object.freeze({
    name,
    imports: parseDirections("imports"),
    exports: parseDirections("exports"),
  });
};

const decodeInternal = (input: unknown, bounds: WitMappingBounds): PortableBoundaryInput => {
  const root = requireRecord(input, "/");
  hasOnly(root, new Set(["format", "package", "theory", "interfaces", "world"]), "/");
  const format = requireString(
    property(root, "format", "/"),
    "/format",
    bounds.maximum_string_length,
  );
  if (format !== WIT_MAPPING_INPUT_FORMAT)
    fail("format.unsupported", "/format", `expected '${WIT_MAPPING_INPUT_FORMAT}'`);
  const packageRecord = requireRecord(property(root, "package", "/"), "/package");
  hasOnly(packageRecord, new Set(["namespace", "name", "version"]), "/package");
  const packageValue = Object.freeze({
    namespace: requirePackagePart(
      property(packageRecord, "namespace", "/package"),
      "/package/namespace",
      bounds.maximum_string_length,
    ),
    name: requirePackagePart(
      property(packageRecord, "name", "/package"),
      "/package/name",
      bounds.maximum_string_length,
    ),
    version: requireString(
      property(packageRecord, "version", "/package"),
      "/package/version",
      bounds.maximum_string_length,
    ),
  });
  if (!versionPattern.test(packageValue.version))
    fail("package.invalid-version", "/package/version", "expected a semantic package version");
  const theoryValue = requireRecord(property(root, "theory", "/"), "/theory");
  hasOnly(
    theoryValue,
    new Set([
      "identity",
      "source_key",
      "complete_contract_identity",
      "laws",
      "effect_labels",
      "usage_grades",
      "assumptions",
      "evidence_requirements",
    ]),
    "/theory",
  );
  const theory = Object.freeze({
    identity: requireIdentity(
      property(theoryValue, "identity", "/theory"),
      "/theory/identity",
      bounds.maximum_string_length,
    ),
    source_key: requireNonemptyString(
      property(theoryValue, "source_key", "/theory"),
      "/theory/source_key",
      bounds.maximum_string_length,
    ),
    complete_contract_identity: requireIdentity(
      property(theoryValue, "complete_contract_identity", "/theory"),
      "/theory/complete_contract_identity",
      bounds.maximum_string_length,
    ),
    laws: parseDeclarations(
      property(theoryValue, "laws", "/theory"),
      "/theory/laws",
      bounds.maximum_fields_or_cases,
      bounds.maximum_string_length,
    ),
    effect_labels: parseDeclarations(
      optionalProperty(theoryValue, "effect_labels") ?? [],
      "/theory/effect_labels",
      bounds.maximum_functions,
      bounds.maximum_string_length,
    ),
    usage_grades: parseDeclarations(
      optionalProperty(theoryValue, "usage_grades") ?? [],
      "/theory/usage_grades",
      bounds.maximum_functions,
      bounds.maximum_string_length,
    ),
    assumptions: parseDeclarations(
      property(theoryValue, "assumptions", "/theory"),
      "/theory/assumptions",
      bounds.maximum_fields_or_cases,
      bounds.maximum_string_length,
    ),
    evidence_requirements: parseDeclarations(
      property(theoryValue, "evidence_requirements", "/theory"),
      "/theory/evidence_requirements",
      bounds.maximum_fields_or_cases,
      bounds.maximum_string_length,
    ),
  });
  const interfaceEntries = requireArray(property(root, "interfaces", "/"), "/interfaces");
  if (interfaceEntries.length > bounds.maximum_interfaces)
    fail("bounds.collection-too-large", "/interfaces", "interface collection is too large");
  const interfaces = interfaceEntries.map((entry, index) =>
    parseInterface(entry, `/interfaces/${index}`, bounds),
  );
  const interfaceNames = new Set<string>();
  for (let index = 0; index < interfaces.length; index += 1) {
    if (interfaceNames.has(interfaces[index]!.name))
      fail(
        "input.duplicate-name",
        `/interfaces/${index}/name`,
        `duplicate interface '${interfaces[index]!.name}'`,
      );
    interfaceNames.add(interfaces[index]!.name);
  }
  if (interfaces.reduce((count, value) => count + value.types.length, 0) > bounds.maximum_types)
    fail("bounds.collection-too-large", "/interfaces", "type count exceeds maximum");
  const functionCount = interfaces.reduce(
    (count, value) =>
      count +
      value.functions.length +
      value.types.reduce(
        (inner, declaration) =>
          inner +
          (declaration.kind === "resource"
            ? declaration.methods.length +
              declaration.statics.length +
              (declaration.constructor === null ? 0 : 1)
            : 0),
        0,
      ),
    0,
  );
  if (functionCount > bounds.maximum_functions)
    fail("bounds.collection-too-large", "/interfaces", "function count exceeds maximum");
  const fieldCount = interfaces.reduce(
    (count, value) =>
      count +
      value.types.reduce((inner, declaration) => {
        if (declaration.kind === "record") return inner + declaration.fields.length;
        if (
          declaration.kind === "variant" ||
          declaration.kind === "enum" ||
          declaration.kind === "flags"
        )
          return inner + declaration.cases.length;
        return inner;
      }, 0),
    0,
  );
  if (fieldCount > bounds.maximum_fields_or_cases)
    fail("bounds.collection-too-large", "/interfaces", "field or case count exceeds maximum");
  const world = parseWorld(property(root, "world", "/"), "/world", bounds);
  for (const direction of ["imports", "exports"] as const) {
    for (const interfaceName of world[direction]) {
      if (!interfaceNames.has(interfaceName))
        fail(
          "world.unknown-interface",
          `/world/${direction}`,
          `world references unknown interface '${interfaceName}'`,
        );
    }
  }
  const imported = new Set(world.imports);
  for (const interfaceName of world.exports) {
    if (imported.has(interfaceName))
      fail(
        "world.ambiguous-direction",
        "/world",
        `world interface '${interfaceName}' cannot be both imported and exported`,
      );
  }
  const result = Object.freeze({
    format: WIT_MAPPING_INPUT_FORMAT,
    package: packageValue,
    theory,
    interfaces: Object.freeze(interfaces),
    world,
  });
  validateTypes(result.interfaces);
  return result;
};

export const decodePortableBoundary = (
  input: unknown,
  bounds?: Partial<WitMappingBounds>,
): WitMappingDecodeResult => {
  try {
    const resolvedBounds = parseBounds(bounds);
    return decoded(freezeDeep(decodeInternal(input, resolvedBounds)));
  } catch (cause) {
    if (cause instanceof DecodeStop) return rejected(cause.issue);
    return rejected(
      diagnostic("decoder.defect", "/", cause instanceof Error ? cause.message : String(cause)),
    );
  }
};

const fail = (code: string, path: string, message: string): never => {
  throw new DecodeStop(diagnostic(code, path, message));
};
