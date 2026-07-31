import { readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import * as tsAst from "typescript/unstable/ast";

/**
 * The exhaustive region classifier (frozen experiment architecture step 5).
 * Discovers every top-level declaration reachable from an entrypoint's
 * transitive relative-import closure using the real TypeScript scanner
 * (`typescript/unstable/ast`, the same token-based approach already
 * established by `tests/inventory-tracer.test.ts`'s
 * `scanImportSpecifiers`/forbidden-import-closure oracle — not a regex),
 * then requires every discovered `const`/`function` region to carry an
 * explicit manifest classification. Discovery is structural: the manifest
 * supplies the CLASSIFICATION for a region the scanner found, never the
 * SET of regions to look for.
 *
 * Fail-closed by construction, not by enumeration: `discoverRegions`
 * recognizes exactly five top-level forms (`import`, `const`, `function`,
 * `interface`, `type`, optionally `export`-prefixed). Any OTHER top-level
 * construct — `let`, `var`, `class`, `enum`, `namespace`, `export default`,
 * a re-export, or a bare statement — throws immediately rather than being
 * silently skipped. This is what makes "every region is counted or
 * excluded" a structural guarantee instead of a claim: an unrecognized
 * construct cannot quietly vanish from both totals (see
 * `classifier.test.ts`'s "unrecognized top-level construct" negative
 * control, and the numerator-oracle gap this corrects,
 * `uncertainties/0004-independent-checker-recut.md`).
 *
 * Physical-line accounting is exact, not additive-per-region: a single
 * sweep assigns each touched source line to exactly one region and throws
 * if two regions ever claim the same physical line (this codebase's style
 * never puts two declarations on one line, but the classifier does not
 * assume that — it verifies it), so no line can be double-counted into the
 * total (see `classifier.test.ts`'s "two declarations on one physical
 * line" negative control).
 *
 * `interface`/`type` declarations are auto-classified `type_only` and
 * `import` statements auto-classified `import` — both structurally, by
 * SyntaxKind alone, never by name — since neither carries runtime decision
 * logic. This is a per-DECLARATION rule, not a per-FILE rule: a stray
 * runtime `const`/`function` placed in an otherwise type-only file still
 * requires its own manifest entry (see `classifier.test.ts`'s mixed-file
 * regression).
 *
 * The import-closure walker (`buildClosure`/`scanImportSpecifiers`) is
 * likewise fail-closed on dependency discovery: an `import(...)` call
 * whose argument is not a string literal, a bare CommonJS `require(...)`
 * call outside `import X = require(...)`, or any `import`/`export`
 * statement matching none of the four recognized forms throws rather than
 * silently failing to record a specifier — the exact known gap the real
 * tracer's own forbidden-import oracle flags as deferred
 * (plans/active/0003, "Decisions and deviations": "Exotic dynamic forms
 * ... remain a known low-severity oracle surface"). See
 * `classifier.test.ts`'s "transitive forbidden bare import through a
 * shared module" negative control, which proves this traverses into (and
 * fails closed within) an imported file, not only the entrypoint itself.
 *
 * IMPORTANT constraint on every file this classifier walks: it uses a
 * plain `Scanner.scan()` loop with no parser-level template resumption, so
 * it CANNOT safely tokenize an interpolated template literal (`` `${x}` ``)
 * — verified empirically to corrupt all tokenization past the first
 * substitution. `production.ts`/`checker.ts`/`canonical.ts` therefore use
 * string concatenation instead of template interpolation; see their header
 * notes and `classifier.test.ts`'s template-literal negative control.
 */

const SK = tsAst.SyntaxKind;

export interface Token {
  readonly kind: number;
  readonly start: number;
  readonly end: number;
  readonly text: string;
}

/** Bounded like `tests/inventory-tracer.test.ts`'s `tokenizeBounded`: caps
 * total tokens at `source.length + 1` and throws if end-of-file is not
 * reached within that bound, so a pathological input fails closed instead
 * of looping. */
export const tokenizeBounded = (source: string): ReadonlyArray<Token> => {
  const scanner = tsAst.createScanner(true, tsAst.LanguageVariant.Standard, source);
  const tokens: Array<Token> = [];
  const cap = source.length + 1;
  for (let i = 0; i <= cap; i++) {
    const kind = scanner.scan();
    if (kind === SK.EndOfFile) return tokens;
    tokens.push({
      kind,
      start: scanner.getTokenStart(),
      end: scanner.getTokenEnd(),
      text: kind === SK.StringLiteral ? scanner.getTokenValue() : scanner.getTokenText(),
    });
  }
  throw new Error(
    "classifier: tokenizer did not reach end of file within " +
      cap +
      " tokens; refusing to continue",
  );
};

const lineOfOffset = (lineStarts: ReadonlyArray<number>, offset: number): number => {
  let low = 0;
  let high = lineStarts.length - 1;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (lineStarts[mid]! <= offset) low = mid;
    else high = mid - 1;
  }
  return low;
};

const OPEN_KINDS = new Set<number>([SK.OpenBraceToken, SK.OpenParenToken, SK.OpenBracketToken]);
const CLOSE_KINDS = new Set<number>([SK.CloseBraceToken, SK.CloseParenToken, SK.CloseBracketToken]);

/**
 * `const`/`type`/`import` declarations always end at their own top-level
 * `;` in this codebase's style. Depth can legitimately return to 0 BEFORE
 * that point without ending the declaration — e.g. an arrow function's
 * parameter list `(...)` closes back to depth 0 while the declaration
 * continues with a return-type annotation, `=>`, and body — so, unlike
 * `consumeBracedDeclaration` below, this does not treat "depth returns to
 * 0" as a stop condition on its own; only an actual top-level
 * `SemicolonToken` ends the region. (Empirically verified: a naive
 * "stop at any depth-0 closing bracket" rule mis-truncates every
 * arrow-function `const` at its parameter list's closing paren.)
 */
export const consumeSemicolonDeclaration = (
  tokens: ReadonlyArray<Token>,
  startIndex: number,
): number => {
  let depth = 0;
  for (let k = startIndex; k < tokens.length; k++) {
    const kind = tokens[k]!.kind;
    if (OPEN_KINDS.has(kind)) depth++;
    else if (CLOSE_KINDS.has(kind)) depth--;
    if (depth === 0 && k > startIndex && kind === SK.SemicolonToken) return k + 1;
  }
  throw new Error(
    "classifier: declaration starting at token index " +
      startIndex +
      " never reached a top-level ';'",
  );
};

/**
 * `function`/`interface` declarations have exactly one top-level brace body
 * (their parameter list or member list) as their last construct, with no
 * trailing `;` in this codebase's style: the region ends at the first
 * `CloseBraceToken` that returns depth to 0, consuming one trailing `;` only
 * if immediately present (harmless defensive case; never expected here).
 * A `function`'s own parameter-list `(...)` closing paren also touches
 * depth 0 first, but its token kind is `CloseParenToken`, not
 * `CloseBraceToken`, so it is correctly skipped.
 */
export const consumeBracedDeclaration = (
  tokens: ReadonlyArray<Token>,
  startIndex: number,
): number => {
  let depth = 0;
  for (let k = startIndex; k < tokens.length; k++) {
    const kind = tokens[k]!.kind;
    if (OPEN_KINDS.has(kind)) depth++;
    else if (CLOSE_KINDS.has(kind)) depth--;
    if (depth === 0 && k > startIndex && kind === SK.CloseBraceToken) {
      const next = tokens[k + 1];
      return next !== undefined && next.kind === SK.SemicolonToken ? k + 2 : k + 1;
    }
  }
  throw new Error(
    "classifier: braced declaration starting at token index " +
      startIndex +
      " never closed at top level",
  );
};

export type RegionKind = "import" | "type_only" | "const" | "function";

export interface DiscoveredRegion {
  readonly kind: RegionKind;
  readonly name: string | null;
  readonly startTokenIndex: number;
  readonly endTokenIndex: number;
}

const DECL_KEYWORDS = new Set<number>([
  SK.ConstKeyword,
  SK.FunctionKeyword,
  SK.InterfaceKeyword,
  SK.TypeKeyword,
]);

const kindOf = (declKeyword: number): RegionKind => {
  if (declKeyword === SK.ConstKeyword) return "const";
  if (declKeyword === SK.FunctionKeyword) return "function";
  return "type_only";
};

/** `function` and `interface` are the only two declaration forms in this
 * codebase's style whose top-level body is a brace with no trailing `;`;
 * every other form (`const`, `type`, `import`) ends at a top-level `;`. */
const isBraced = (declKeyword: number): boolean =>
  declKeyword === SK.FunctionKeyword || declKeyword === SK.InterfaceKeyword;

/**
 * Discovers every top-level `import`/`const`/`function`/`interface`/`type`
 * declaration in `source`, purely from real tokens. Fails closed (throws)
 * on any other top-level construct: `let`/`var`/`class`/`enum`/`namespace`,
 * `export default`, a re-export, or anything else this classifier does not
 * structurally model. Comments and whitespace are invisible to this
 * function — the scanner (`skipTrivia: true`) never emits them as tokens.
 */
export const discoverRegions = (tokens: ReadonlyArray<Token>): ReadonlyArray<DiscoveredRegion> => {
  const regions: Array<DiscoveredRegion> = [];
  let i = 0;
  while (i < tokens.length) {
    const token = tokens[i]!;
    if (token.kind === SK.ImportKeyword) {
      const end = consumeSemicolonDeclaration(tokens, i);
      regions.push({ kind: "import", name: null, startTokenIndex: i, endTokenIndex: end });
      i = end;
      continue;
    }
    const cursor = token.kind === SK.ExportKeyword ? i + 1 : i;
    const declToken = tokens[cursor];
    if (declToken !== undefined && DECL_KEYWORDS.has(declToken.kind)) {
      const nameToken = tokens[cursor + 1];
      const end = isBraced(declToken.kind)
        ? consumeBracedDeclaration(tokens, i)
        : consumeSemicolonDeclaration(tokens, i);
      regions.push({
        kind: kindOf(declToken.kind),
        name: nameToken?.text ?? null,
        startTokenIndex: i,
        endTokenIndex: end,
      });
      i = end;
      continue;
    }
    // Fail closed: every top-level token must start one of the five
    // recognized forms above (optionally `export`-prefixed). A
    // `let`/`var`/`class`/`enum`/`namespace`, `export default`, a
    // re-export, or any other unmodelled top-level construct throws
    // rather than silently disappearing from both the included and
    // excluded totals.
    throw new Error(
      "classifier: unrecognized top-level construct at token index " +
        i +
        " (kind=" +
        token.kind +
        ", text=" +
        JSON.stringify(token.text) +
        ") — every top-level region must be import/const/function/interface/type",
    );
  }
  return regions;
};

/**
 * Assigns every physical source line touched by a token to exactly one
 * region, and throws if two DIFFERENT regions ever claim the same line —
 * the "two declarations on one physical line" case this codebase's style
 * never produces but the classifier does not assume away. Regions are
 * discovered as a contiguous, gap-free partition of the token stream (any
 * gap would already have thrown in `discoverRegions`), so every token
 * belongs to exactly one region; a two-pointer sweep in token order is
 * sufficient and linear.
 */
const partitionPhysicalLines = (
  tokens: ReadonlyArray<Token>,
  lineStarts: ReadonlyArray<number>,
  regions: ReadonlyArray<DiscoveredRegion>,
): ReadonlyMap<number, number> => {
  const lineOwner = new Map<number, number>();
  let regionIndex = 0;
  for (let t = 0; t < tokens.length; t++) {
    while (regionIndex < regions.length && t >= regions[regionIndex]!.endTokenIndex) regionIndex++;
    if (regionIndex >= regions.length || t < regions[regionIndex]!.startTokenIndex) {
      throw new Error("classifier: token index " + t + " is not covered by any discovered region");
    }
    const line = lineOfOffset(lineStarts, tokens[t]!.start);
    const existing = lineOwner.get(line);
    if (existing !== undefined && existing !== regionIndex) {
      const a = regions[existing]!;
      const b = regions[regionIndex]!;
      throw new Error(
        "classifier: physical line " +
          (line + 1) +
          " is claimed by two declarations ('" +
          (a.name ?? a.kind) +
          "' and '" +
          (b.name ?? b.kind) +
          "') — cannot unambiguously attribute a shared line",
      );
    }
    lineOwner.set(line, regionIndex);
  }
  return lineOwner;
};

// --- Import closure ---

interface ImportScanResult {
  readonly relativeSpecifiers: ReadonlyArray<string>;
  readonly bareSpecifiers: ReadonlyArray<string>;
}

const isStatementBoundary = (kind: number): boolean =>
  kind === SK.SemicolonToken || kind === SK.ImportKeyword || kind === SK.ExportKeyword;

/**
 * Adapted from `tests/inventory-tracer.test.ts`'s `scanImportSpecifiers`,
 * with one addition: fails closed instead of silently recording nothing
 * for a form it cannot classify. Recognizes side-effect imports, dynamic
 * imports with a literal specifier, static/type/namespace/default/named
 * imports and re-exports (by scanning forward from `import`/`export` for a
 * `from STRING` pair), and import-equals/require — and throws on: a
 * dynamic `import(...)` whose argument is not a string literal; an
 * `import` statement matching none of the four recognized forms; or a
 * bare `require(...)` call outside `import X = require(...)`.
 */
const scanImportSpecifiers = (tokens: ReadonlyArray<Token>): ImportScanResult => {
  const relativeSpecifiers: Array<string> = [];
  const bare: Array<string> = [];
  const record = (specifier: string): void => {
    if (specifier.startsWith("./") || specifier.startsWith("../"))
      relativeSpecifiers.push(specifier);
    else bare.push(specifier);
  };

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!;

    // "require" scans as its own dedicated RequireKeyword, not a plain
    // Identifier (verified empirically) — checking only `Identifier` here
    // would silently miss every bare `require(...)` call.
    if (token.kind === SK.RequireKeyword && tokens[i + 1]?.kind === SK.OpenParenToken) {
      const eq = tokens[i - 1];
      const nameIdent = tokens[i - 2];
      const importKw = tokens[i - 3];
      const isImportEquals =
        eq?.kind === SK.EqualsToken &&
        nameIdent?.kind === SK.Identifier &&
        importKw?.kind === SK.ImportKeyword;
      if (!isImportEquals) {
        throw new Error(
          "classifier: unsupported bare require(...) call at token index " +
            i +
            " — only 'import NAME = require(\"...\")' is recognized",
        );
      }
      // Recognized as part of import-equals; its specifier is recorded by
      // the ImportKeyword branch below on the same statement.
    }

    if (token.kind !== SK.ImportKeyword && token.kind !== SK.ExportKeyword) continue;

    if (token.kind === SK.ImportKeyword && tokens[i + 1]?.kind === SK.StringLiteral) {
      record(tokens[i + 1]!.text);
      continue;
    }
    if (token.kind === SK.ImportKeyword && tokens[i + 1]?.kind === SK.OpenParenToken) {
      if (tokens[i + 2]?.kind !== SK.StringLiteral) {
        throw new Error(
          "classifier: unsupported dynamic import(...) with a non-string-literal argument at token index " +
            i,
        );
      }
      record(tokens[i + 2]!.text);
      continue;
    }

    let matched = false;
    for (let j = i + 1; j < tokens.length; j++) {
      const candidate = tokens[j]!;
      if (candidate.kind === SK.FromKeyword && tokens[j + 1]?.kind === SK.StringLiteral) {
        record(tokens[j + 1]!.text);
        matched = true;
        break;
      }
      if (
        token.kind === SK.ImportKeyword &&
        candidate.text === "=" &&
        tokens[j + 1]?.text === "require" &&
        tokens[j + 2]?.kind === SK.OpenParenToken &&
        tokens[j + 3]?.kind === SK.StringLiteral
      ) {
        record(tokens[j + 3]!.text);
        matched = true;
        break;
      }
      if (isStatementBoundary(candidate.kind)) break;
    }
    if (!matched && token.kind === SK.ImportKeyword) {
      throw new Error(
        "classifier: import statement at token index " +
          i +
          " matches none of the recognized forms (side-effect, dynamic-string, static 'from', or import-equals-require)",
      );
    }
    // An `export`-initiated statement that never reaches `from STRING`
    // (e.g. `export const x = ...;`, `export interface Foo {...}`) is an
    // ordinary declaration, not a re-export — nothing to record, and not a
    // failure; only `import`-initiated statements are required to resolve
    // to one of the four dependency-bearing forms.
  }
  return { relativeSpecifiers, bareSpecifiers: bare };
};

const resolveSpecifier = (fromFile: string, specifier: string): string => {
  const withExtension = specifier.endsWith(".ts") ? specifier : specifier + ".ts";
  return resolve(dirname(fromFile), withExtension);
};

export interface ClosureResult {
  readonly files: ReadonlyMap<string, string>;
  readonly bareImports: ReadonlySet<string>;
}

/** Transitive closure over relative imports only, rooted at `entryAbsPath`.
 * Reads each file at most once. Bare (non-relative) specifiers are
 * recorded, never followed. */
export const buildClosure = (entryAbsPath: string): ClosureResult => {
  const files = new Map<string, string>();
  const bareImports = new Set<string>();
  const pending = [entryAbsPath];
  while (pending.length > 0) {
    const path = pending.pop()!;
    if (files.has(path)) continue;
    const source = readFileSync(path, "utf8");
    files.set(path, source);
    const tokens = tokenizeBounded(source);
    const scanned = scanImportSpecifiers(tokens);
    for (const specifier of scanned.bareSpecifiers) bareImports.add(specifier);
    for (const specifier of scanned.relativeSpecifiers)
      pending.push(resolveSpecifier(path, specifier));
  }
  return { files, bareImports };
};

// --- Manifest-driven classification ---

export interface RegionClassification {
  readonly classification: "included" | "excluded";
  readonly category: string;
}

export type FileManifest = Readonly<Record<string, RegionClassification>>;
export type Manifest = Readonly<Record<string, FileManifest>>;

export interface ClassifiedFile {
  readonly file: string;
  readonly includedLines: number;
  readonly excludedLines: number;
  readonly categories: Readonly<Record<string, number>>;
}

/**
 * Classifies one file's source: discovers its regions (failing closed on
 * anything unrecognized), classifies each (`import`/`type_only` auto-
 * excluded; `const`/`function` looked up in `fileManifest`, throwing if
 * absent), then partitions physical lines across regions (throwing on a
 * shared-line ambiguity) and sums by classification/category.
 */
export const classifySource = (
  source: string,
  fileManifest: FileManifest,
  fileLabel: string,
): ClassifiedFile & { readonly file: string } => {
  const tokens = tokenizeBounded(source);
  const lineStarts = tsAst.computeLineStarts(source);
  const regions = discoverRegions(tokens);

  const classifications = regions.map((region): RegionClassification => {
    if (region.kind === "import") return { classification: "excluded", category: "import" };
    if (region.kind === "type_only") return { classification: "excluded", category: "type_only" };
    const entry = region.name === null ? undefined : fileManifest[region.name];
    if (entry === undefined) {
      throw new Error(
        "classifier: unclassified " +
          region.kind +
          " region '" +
          String(region.name) +
          "' in " +
          fileLabel +
          " — every const/function region must receive an explicit manifest classification",
      );
    }
    return entry;
  });

  const lineOwner = partitionPhysicalLines(tokens, lineStarts, regions);

  let includedLines = 0;
  let excludedLines = 0;
  const categories: Record<string, number> = {};
  for (const regionIndex of lineOwner.values()) {
    const cls = classifications[regionIndex]!;
    categories[cls.category] = (categories[cls.category] ?? 0) + 1;
    if (cls.classification === "included") includedLines++;
    else excludedLines++;
  }
  return { file: fileLabel, includedLines, excludedLines, categories };
};

export interface ClassifyResult {
  readonly totalIncludedLines: number;
  readonly files: ReadonlyArray<ClassifiedFile>;
  readonly bareImports: ReadonlySet<string>;
}

/**
 * Classifies every file in `entryAbsPath`'s import closure. A region the
 * classifier discovers but that has no manifest entry — or a top-level
 * construct it does not structurally recognize at all — throws rather
 * than being silently skipped: the exhaustive-discovery guarantee this
 * classifier exists for.
 */
export const classifyClosure = (
  entryAbsPath: string,
  manifest: Manifest,
  rootDir: string,
): ClassifyResult => {
  const closure = buildClosure(entryAbsPath);
  const files: Array<ClassifiedFile> = [];
  let totalIncludedLines = 0;
  for (const [absPath, source] of closure.files) {
    const relName = relative(rootDir, absPath);
    const classified = classifySource(source, manifest[relName] ?? {}, relName);
    files.push(classified);
    totalIncludedLines += classified.includedLines;
  }
  return { totalIncludedLines, files, bareImports: closure.bareImports };
};

export interface SymmetricMeasurement {
  readonly production: ClassifyResult;
  readonly checker: ClassifyResult;
  readonly ratioPercent: number;
  readonly decision: "selected" | "rejected";
}

/** The frozen stop rule: pass only when `checker * 10 <= production * 7`
 * (plans/active/0003). */
export const measureSymmetric = (
  productionEntryAbsPath: string,
  checkerEntryAbsPath: string,
  manifest: Manifest,
  rootDir: string,
): SymmetricMeasurement => {
  const production = classifyClosure(productionEntryAbsPath, manifest, rootDir);
  const checker = classifyClosure(checkerEntryAbsPath, manifest, rootDir);
  const ratioPercent = (checker.totalIncludedLines / production.totalIncludedLines) * 100;
  const decision =
    checker.totalIncludedLines * 10 <= production.totalIncludedLines * 7 ? "selected" : "rejected";
  return { production, checker, ratioPercent, decision };
};
