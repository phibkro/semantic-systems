import { resolve } from "node:path";
import { measureSymmetric } from "./classifier.ts";
import { REGION_MANIFEST } from "./manifest.ts";

/**
 * The visible measurement command (frozen experiment architecture,
 * plans/active/0003 "Next delegated resolving experiment"). Prints the raw
 * per-file breakdown, the exact cross-multiplied ratio, and the
 * `selected`/`rejected` decision per the frozen stop rule: pass only when
 * `checker * 10 <= production * 7`.
 *
 * Exits 0 whenever it produces a complete, internally consistent
 * measurement — `selected`/`rejected` is a separate field in that output,
 * not the process exit code (plans/active/0003: "The measurement command
 * exits successfully when it produces a complete, internally consistent
 * result; its structured output separately records `selected` or
 * `rejected`."). It exits nonzero only if classification itself fails
 * (an unclassified region, a broken closure, or similar) — see
 * `classifier.test.ts` for that oracle.
 */

const rootDir = resolve(import.meta.dirname);
const productionEntry = resolve(rootDir, "production.ts");
const checkerEntry = resolve(rootDir, "checker.ts");

const result = measureSymmetric(productionEntry, checkerEntry, REGION_MANIFEST, rootDir);

const printFile = (label: string, files: typeof result.production.files) => {
  console.log(label + ":");
  for (const file of files) {
    console.log(
      "  " +
        file.file +
        ": included=" +
        file.includedLines +
        " excluded=" +
        file.excludedLines +
        " categories=" +
        JSON.stringify(file.categories),
    );
  }
};

console.log("=== Declarative shared-policy experiment: symmetric measurement ===");
printFile("production (entry production.ts)", result.production.files);
console.log("  production total included lines: " + result.production.totalIncludedLines);
console.log("  production bare imports: " + JSON.stringify([...result.production.bareImports]));
printFile("checker (entry checker.ts)", result.checker.files);
console.log("  checker total included lines: " + result.checker.totalIncludedLines);
console.log("  checker bare imports: " + JSON.stringify([...result.checker.bareImports]));
console.log(
  "ratio: checker/production = " +
    result.checker.totalIncludedLines +
    "/" +
    result.production.totalIncludedLines +
    " = " +
    result.ratioPercent.toFixed(1) +
    "%",
);
console.log(
  "gate: checker*10 <= production*7 -> " +
    result.checker.totalIncludedLines * 10 +
    " <= " +
    result.production.totalIncludedLines * 7 +
    " = " +
    (result.checker.totalIncludedLines * 10 <= result.production.totalIncludedLines * 7),
);
console.log("decision: " + result.decision);
