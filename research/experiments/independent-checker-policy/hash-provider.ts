import { createHash } from "node:crypto";
import type { HashFn } from "./canonical.ts";

/**
 * The concrete SHA-256 `HashFn` implementation, deliberately kept OUTSIDE
 * both measured closures: `production.ts` and `checker.ts` never import
 * this file, only `canonical.ts`'s `HashFn` type. `node:crypto` is a real
 * platform capability, and the frozen forbidden-import oracle applies to
 * the generic checker's whole transitive closure — a symmetric size
 * exclusion for `canonical.ts` does not exempt dependency closure (see
 * `canonical.ts`'s header note). Only `fixtures.ts`, `measure.ts`, and the
 * test suite import this module, then pass the resulting `HashFn` value
 * into `production.adjudicate`/`checker.compare` as an ordinary parameter.
 */
export const sha256Hex: HashFn = (input) => createHash("sha256").update(input).digest("hex");
