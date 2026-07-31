import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, test } from "bun:test";
import {
  buildClosure,
  classifyClosure,
  classifySource,
  discoverRegions,
  measureSymmetric,
  tokenizeBounded,
} from "./classifier.ts";
import { REGION_MANIFEST } from "./manifest.ts";

const ROOT = resolve(import.meta.dirname);
const PRODUCTION_ENTRY = resolve(ROOT, "production.ts");
const CHECKER_ENTRY = resolve(ROOT, "checker.ts");

describe("symmetric measurement over the real production.ts / checker.ts closures", () => {
  test("both closures have zero bare imports and never reach each other or the adapter/fixtures/tooling files", () => {
    const result = measureSymmetric(PRODUCTION_ENTRY, CHECKER_ENTRY, REGION_MANIFEST, ROOT);
    expect(result.production.bareImports.size).toBe(0);
    expect(result.checker.bareImports.size).toBe(0);

    const productionFiles = new Set(result.production.files.map((f) => f.file));
    expect(productionFiles).toEqual(
      new Set(["production.ts", "shared-types.ts", "policy-contract.ts", "canonical.ts"]),
    );

    const checkerFiles = new Set(result.checker.files.map((f) => f.file));
    expect(checkerFiles).toEqual(
      new Set(["checker.ts", "shared-types.ts", "policy-contract.ts", "canonical.ts"]),
    );
    for (const forbidden of [
      "production.ts",
      "canonical-binding-adapter.ts",
      "fixtures.ts",
      "hash-provider.ts",
      "measure.ts",
      "classifier.ts",
      "manifest.ts",
    ]) {
      expect(checkerFiles.has(forbidden)).toBeFalse();
    }
  });

  test("the frozen stop rule: this measurement's ratio exceeds 70%, so the decision is 'rejected' — asserted as expected, not a suite failure", () => {
    const result = measureSymmetric(PRODUCTION_ENTRY, CHECKER_ENTRY, REGION_MANIFEST, ROOT);
    expect(result.production.totalIncludedLines).toBe(489);
    expect(result.checker.totalIncludedLines).toBe(764);
    expect(
      result.checker.totalIncludedLines * 10 <= result.production.totalIncludedLines * 7,
    ).toBeFalse();
    expect(result.decision).toBe("rejected");
  });
});

describe("classifier tokenization safety", () => {
  test("production.ts, checker.ts, canonical.ts, policy-contract.ts, and shared-types.ts tokenize cleanly", () => {
    for (const file of [
      "production.ts",
      "checker.ts",
      "canonical.ts",
      "policy-contract.ts",
      "shared-types.ts",
    ]) {
      const source = readFileSync(resolve(ROOT, file), "utf8");
      expect(() => tokenizeBounded(source)).not.toThrow();
    }
  });

  test("an interpolated template literal corrupts plain-scanner tokenization past the first substitution", () => {
    const source = "const msg = `hello ${name} world ${1 + 2}`;\nconst after = 42;\n";
    const tokens = tokenizeBounded(source);
    // A real parser would see `after` as its own Identifier token; the
    // plain scanner instead swallows the remainder of the file into one
    // corrupted trailing template token. This is why production.ts,
    // checker.ts, and canonical.ts use string concatenation instead of
    // interpolation (see their header notes).
    expect(tokens.some((t) => t.text === "after")).toBeFalse();
  });
});

describe("shared-types.ts stays strictly type-only", () => {
  test("contributes zero const/function regions", () => {
    const source = readFileSync(resolve(ROOT, "shared-types.ts"), "utf8");
    const regions = discoverRegions(tokenizeBounded(source));
    expect(regions.length).toBeGreaterThan(0);
    expect(
      regions.every((region) => region.kind === "type_only" || region.kind === "import"),
    ).toBeTrue();
  });
});

describe("negative control: unclassified regions fail measurement instead of disappearing", () => {
  test("a runtime const in an otherwise type-only file is not exempted by file-level type_only", () => {
    const source = [
      "export interface Foo {",
      "  readonly a: string;",
      "}",
      "",
      "export const BAR = 1;",
      "",
    ].join("\n");
    const regions = discoverRegions(tokenizeBounded(source));
    expect(regions.map((r) => r.kind)).toEqual(["type_only", "const"]);
    expect(() => classifySource(source, {}, "mixed.ts")).toThrow(/unclassified const region 'BAR'/);
    const classified = classifySource(
      source,
      { BAR: { classification: "included", category: "test_category" } },
      "mixed.ts",
    );
    expect(classified.categories.type_only).toBeGreaterThan(0);
    expect(classified.categories.test_category).toBe(1);
  });

  test("a fully reachable const region through a real closure fails classifyClosure when absent from the manifest", async () => {
    const dir = await mkdtemp(join(tmpdir(), "classifier-unclassified-"));
    try {
      const entryPath = join(dir, "entry.ts");
      await writeFile(entryPath, "export const UNDOCUMENTED = 1;\n");
      expect(() => classifyClosure(entryPath, {}, dir)).toThrow(
        /unclassified const region 'UNDOCUMENTED'/,
      );
    } finally {
      await rm(dir, { recursive: true });
    }
  });
});

describe("negative control: unrecognized top-level constructs fail closed", () => {
  for (const [label, snippet] of [
    ["class", "export class Thing {}\n"],
    ["let", "let x = 1;\n"],
    ["var", "var x = 1;\n"],
    ["enum", "enum Color { Red, Green }\n"],
    ["namespace", "namespace NS {\n  export const x = 1;\n}\n"],
    ["export default", "export default 1;\n"],
    ["bare re-export", 'export { something } from "./somewhere.ts";\n'],
  ] as const) {
    test("a top-level " + label + " construct throws instead of vanishing", () => {
      expect(() => discoverRegions(tokenizeBounded(snippet))).toThrow(
        /unrecognized top-level construct/,
      );
    });
  }
});

describe("negative control: two declarations sharing one physical line cannot be double-counted", () => {
  test("classification throws rather than counting the shared line twice", () => {
    const source = "export const A = 1; export const B = 2;\n";
    const manifest = {
      A: { classification: "included" as const, category: "test_category" },
      B: { classification: "included" as const, category: "test_category" },
    };
    expect(() => classifySource(source, manifest, "oneline.ts")).toThrow(
      /claimed by two declarations/,
    );
  });
});

describe("negative control: a transitive forbidden bare import through a shared module is discovered", () => {
  test("buildClosure discovers a bare import reached through an imported file, not only the entrypoint", async () => {
    const dir = await mkdtemp(join(tmpdir(), "classifier-transitive-"));
    try {
      const sharedPath = join(dir, "shared-canon.ts");
      const entryPath = join(dir, "entry.ts");
      await writeFile(
        sharedPath,
        'import { readFileSync } from "node:fs";\nexport const readIt = (p: string): string => readFileSync(p, "utf8");\n',
      );
      await writeFile(
        entryPath,
        'import { readIt } from "./shared-canon.ts";\nexport const useIt = (): string => readIt("/etc/hostname");\n',
      );
      const closure = buildClosure(entryPath);
      expect([...closure.bareImports]).toContain("node:fs");
      expect(closure.files.has(sharedPath)).toBeTrue();
    } finally {
      await rm(dir, { recursive: true });
    }
  });

  test("a dynamic import(...) with a non-string-literal argument fails closed", async () => {
    const dir = await mkdtemp(join(tmpdir(), "classifier-dynamic-"));
    try {
      const entryPath = join(dir, "entry.ts");
      await writeFile(entryPath, 'const name = "./x.ts";\nconst mod = import(name);\n');
      expect(() => buildClosure(entryPath)).toThrow(/unsupported dynamic import/);
    } finally {
      await rm(dir, { recursive: true });
    }
  });

  test("a bare CommonJS require(...) call outside import-equals fails closed", async () => {
    const dir = await mkdtemp(join(tmpdir(), "classifier-require-"));
    try {
      const entryPath = join(dir, "entry.ts");
      await writeFile(entryPath, 'const fs = require("node:fs");\n');
      expect(() => buildClosure(entryPath)).toThrow(/unsupported bare require/);
    } finally {
      await rm(dir, { recursive: true });
    }
  });
});
