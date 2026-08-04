/* oxlint-disable semantic-effect/typed-failure-boundary -- this synchronous validator intentionally throws stable contract diagnostics for the command boundary to report */
import {
  generate as generateCss,
  ident as cssIdentifier,
  lexer as cssLexer,
  parse as parseCss,
  walk as walkCss,
  type Declaration,
  type DeclarationList,
} from "css-tree";
import { fromMarkdown } from "mdast-util-from-markdown";
import type { Heading, Nodes, RootContent } from "mdast";
import { micromark } from "micromark";
import { parseFragment, type DefaultTreeAdapterTypes } from "parse5";

export const DESIGN_LENS_VERSION = "open-semantic-system-v1";
export const DESIGN_LENS_HEADINGS = [
  "Boundary and warranted state",
  "Semantic inputs",
  "Semantic outputs",
  "Effect protocols and uncertainty",
  "Components and orthogonal structures",
  "Bounded autonomy and resources",
  "Evidence, assumptions, and unsupported claims",
] as const;

const PLACEHOLDER_WORDS = new Set([
  "todo",
  "tbd",
  "placeholder",
  "later",
  "pending",
  "coming",
  "soon",
  "fill",
  "me",
  "explain",
  "none",
  "na",
  "n/a",
]);

const isPlaceholderOnly = (visible: string): boolean => {
  const normalized = visible.trim();
  if (normalized.length === 0) return true;
  const words = normalized
    .toLowerCase()
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^[\s>*+-]+/gm, "")
    .split(/[\s`_*[\](){}:;,.!?-]+/)
    .filter((word) => word.length > 0);
  return words.every((word) => PLACEHOLDER_WORDS.has(word) || /^[0-9]+$/.test(word));
};

const sourceForNode = (content: string, node: Nodes): string => {
  const start = node.position?.start.offset;
  const end = node.position?.end.offset;
  return start === undefined || end === undefined ? "" : content.slice(start, end);
};

const atxHeadingTitle = (content: string, heading: Heading): string | undefined => {
  const source = sourceForNode(content, heading);
  const match = /^ {0,3}(#{1,6})(?:[ \t]+(.*)|[ \t]*)$/.exec(source);
  if (match === null || match[1]!.length !== heading.depth) return undefined;
  return (match[2] ?? "").replace(/[ \t]+#+[ \t]*$/, "").trim();
};

const NONVISIBLE_HTML_ELEMENTS = new Set([
  "audio",
  "canvas",
  "datalist",
  "head",
  "iframe",
  "math",
  "meter",
  "noembed",
  "noframes",
  "noscript",
  "object",
  "optgroup",
  "option",
  "progress",
  "rp",
  "script",
  "select",
  "style",
  "svg",
  "template",
  "title",
  "video",
]);

const directStyleExcludesContent = (style: string): boolean => {
  let declarationList: DeclarationList;
  try {
    const parsed = parseCss(style, { context: "declarationList", positions: false });
    if (parsed.type !== "DeclarationList") return false;
    declarationList = parsed;
  } catch {
    // An unparseable direct style is outside this static evidence boundary.
    // Excluding its subtree prevents unknown rendering from satisfying prose.
    return true;
  }

  const cascaded = new Map<string, { important: boolean; value: string }>();
  for (const child of declarationList.children) {
    if (child.type !== "Declaration") continue;
    const declaration = child as Declaration;
    const property = cssIdentifier.decode(declaration.property).toLowerCase();
    if (property !== "display" && property !== "visibility") continue;
    const value = cssIdentifier.decode(generateCss(declaration.value).trim()).toLowerCase();
    const grammar = cssLexer.matchProperty(property, value);
    if (grammar.error !== null) {
      let indeterminate = false;
      walkCss(declaration.value, (node) => {
        if (node.type === "Function" || node.type === "Raw") indeterminate = true;
      });
      // Substitution and opaque syntax depends on state this gate does not
      // observe. It is neither fabricated as visible nor parsed by a local
      // approximation of the browser's evolving argument grammars.
      if (indeterminate) return true;
      continue;
    }
    const important = Boolean(declaration.important);
    const previous = cascaded.get(property);
    if (previous?.important === true && !important) continue;
    cascaded.set(property, {
      important,
      value,
    });
  }

  return (
    cascaded.get("display")?.value === "none" ||
    new Set(["hidden", "collapse"]).has(cascaded.get("visibility")?.value ?? "")
  );
};

const staticallyHidden = (node: DefaultTreeAdapterTypes.Element): boolean => {
  if (NONVISIBLE_HTML_ELEMENTS.has(node.tagName)) return true;
  if (node.attrs.some((attribute) => attribute.name === "hidden")) return true;
  if (
    node.attrs.some((attribute) => attribute.name === "popover") &&
    !(node.tagName === "dialog" && node.attrs.some((attribute) => attribute.name === "open"))
  ) {
    return true;
  }
  if (node.tagName === "dialog" && !node.attrs.some((attribute) => attribute.name === "open")) {
    return true;
  }
  const style = node.attrs.find((attribute) => attribute.name === "style")?.value;
  return style !== undefined && directStyleExcludesContent(style);
};

const renderedMarkdownContent = (source: string): string => {
  const textFrom = (node: DefaultTreeAdapterTypes.Node): string => {
    if ("value" in node) return node.value;
    if (node.nodeName === "#comment" || node.nodeName === "#documentType") return "";
    if ("tagName" in node && staticallyHidden(node)) return "";
    if (
      "tagName" in node &&
      node.tagName === "details" &&
      !node.attrs.some((attribute) => attribute.name === "open")
    ) {
      const summary = node.childNodes.find(
        (child): child is DefaultTreeAdapterTypes.Element =>
          "tagName" in child && child.tagName === "summary",
      );
      return summary === undefined ? "" : textFrom(summary);
    }
    if ("childNodes" in node) return node.childNodes.map((child) => textFrom(child)).join("\n");
    return "";
  };

  return textFrom(parseFragment(micromark(source, { allowDangerousHtml: true })));
};

const codeRanges = (node: Nodes): ReadonlyArray<readonly [start: number, end: number]> => {
  if (node.type === "code") {
    const start = node.position?.start.offset;
    const end = node.position?.end.offset;
    return start === undefined || end === undefined ? [] : [[start, end]];
  }
  if ("children" in node) {
    return node.children.flatMap((child) => codeRanges(child));
  }
  return [];
};

const visibleDesignContent = (content: string, nodes: readonly RootContent[]): string => {
  const first = nodes[0]?.position?.start.offset;
  const end = nodes.at(-1)?.position?.end.offset;
  if (first === undefined || end === undefined) return "";

  const ranges = nodes.flatMap((node) => codeRanges(node)).sort(([left], [right]) => left - right);
  let cursor = first;
  let source = "";
  for (const [hiddenStart, hiddenEnd] of ranges) {
    source += content.slice(cursor, hiddenStart);
    source += content.slice(hiddenStart, hiddenEnd).replace(/[^\r\n]/g, " ");
    cursor = hiddenEnd;
  }
  source += content.slice(cursor, end);
  return renderedMarkdownContent(source);
};

const markerValues = (content: string, children: readonly RootContent[]): string[] =>
  children.flatMap((node) => {
    if (node.type !== "paragraph") return [];
    const match = /^Design-Lens-Version:[ \t]*(.*?)[ \t]*$/.exec(sourceForNode(content, node));
    return match === null ? [] : [match[1] ?? ""];
  });

type StructuralHeading = {
  readonly level: number;
  readonly title: string;
  readonly childIndex: number;
};

const structuralHeadings = (
  content: string,
  children: readonly RootContent[],
): StructuralHeading[] =>
  children.flatMap((node, childIndex) => {
    if (node.type !== "heading") return [];
    const title = atxHeadingTitle(content, node);
    return title === undefined ? [] : [{ level: node.depth, title, childIndex }];
  });

export const validateDesignLensText = (content: string, path: string): void => {
  const document = fromMarkdown(content);
  const children = document.children;
  const markers = markerValues(content, children);
  if (markers.length !== 1) {
    throw new Error(
      `${path} design-lens shape requires exactly one Design-Lens-Version marker; found ${markers.length}`,
    );
  }
  if (markers[0] !== DESIGN_LENS_VERSION) {
    throw new Error(
      `${path} design-lens version must be ${DESIGN_LENS_VERSION}; received ${JSON.stringify(markers[0])}`,
    );
  }

  const headings = structuralHeadings(content, children);
  const levelTwo = headings.filter((heading) => heading.level === 2);
  const lensHeadings = levelTwo.filter(
    (heading) => heading.title === "Open semantic system design lens",
  );
  if (lensHeadings.length !== 1) {
    throw new Error(
      `${path} design-lens shape requires exactly one "Open semantic system design lens" section; found ${lensHeadings.length}`,
    );
  }
  const lensHeading = lensHeadings[0]!;
  const start = lensHeading.childIndex + 1;
  const nextSectionBoundary = headings.find(
    (candidate) => candidate.childIndex > lensHeading.childIndex && candidate.level <= 2,
  );
  const end = nextSectionBoundary?.childIndex ?? children.length;
  const levelThree = headings.filter(
    (heading) => heading.level === 3 && heading.childIndex >= start && heading.childIndex < end,
  );

  for (const required of DESIGN_LENS_HEADINGS) {
    const matches = levelThree.filter((heading) => heading.title === required);
    if (matches.length !== 1) {
      throw new Error(
        `${path} design-lens subsection "${required}" must appear exactly once; found ${matches.length}`,
      );
    }
    const heading = matches[0]!;
    const sectionStart = heading.childIndex + 1;
    const next = levelThree.find((candidate) => candidate.childIndex > heading.childIndex);
    const sectionEnd = next?.childIndex ?? end;
    const visible = visibleDesignContent(content, children.slice(sectionStart, sectionEnd));
    if (isPlaceholderOnly(visible)) {
      throw new Error(`${path} design-lens subsection "${required}" is empty or placeholder-only`);
    }
  }
};
