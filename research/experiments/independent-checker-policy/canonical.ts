import type { JsonObject, JsonValue } from "./shared-types.ts";

/**
 * Canonical JSON + injected-hash content identity, adapted (not imported)
 * from `src/tracer/canonical.ts`'s algorithm: recursively sort object keys,
 * reject non-finite numbers, then hash the resulting JSON text. This is the
 * one file `production.ts` and `checker.ts` are both permitted to import
 * beyond the declarative contract and neutral types (frozen experiment
 * architecture step 2). The classifier excludes it entirely from the
 * symmetric size measurement under the named "canonical_json_hash_runtime"
 * rule — sharing it is a visible correlated-TCB assumption, not independent
 * proof of hashing correctness (design spec 0003, "Independent checker").
 *
 * `contentIdentity` takes the actual digest algorithm as an injected
 * `HashFn` parameter rather than importing `node:crypto` (or any bare
 * capability) directly: the frozen forbidden-import oracle applies to the
 * generic checker's WHOLE transitive closure, including shared modules —
 * a symmetric size exclusion does not exempt dependency closure. This file
 * therefore has zero non-relative imports; the concrete SHA-256
 * implementation lives in `hash-provider.ts`, imported only by
 * `fixtures.ts`, `measure.ts`, and the test suite — never by
 * `production.ts` or `checker.ts` themselves, which only ever receive a
 * `HashFn` value as a parameter. Using the SAME injected `HashFn` on both
 * sides is itself the visible correlated-TCB assumption (recorded in
 * `research/independent-checker-shared-policy-experiment.md`); this
 * module's canonicalization algorithm is the other half of it.
 *
 * Uses string concatenation, never an interpolated template literal:
 * `classifier.ts`'s region scanner is a plain-token scanner
 * (`typescript/unstable/ast`'s `Scanner`, without the parser's template
 * re-scan orchestration) and cannot safely resume after a `${...}`
 * substitution — verified empirically to corrupt tokenization of everything
 * past the first substitution. Concatenation keeps this file (walked by
 * both measured closures) safe for that scanner; see
 * `classifier.test.ts`'s template-literal negative control.
 */

export type HashFn = (input: string) => string;

const canonicalize = (value: JsonValue): JsonValue => {
  if (typeof value === "number" && !Number.isFinite(value)) {
    throw new RangeError("canonical JSON rejects non-finite numbers");
  }
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([key, item]) => [key, canonicalize(item)]),
    ) as JsonObject;
  }
  return value;
};

export const canonicalJson = (value: JsonValue): string => JSON.stringify(canonicalize(value));

export const contentIdentity = (hash: HashFn, value: JsonValue): string =>
  "sha256:" + hash(canonicalJson(value));

export const jsonEqual = (left: JsonValue, right: JsonValue): boolean =>
  canonicalJson(left) === canonicalJson(right);
