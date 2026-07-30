import { describe, expect, test } from "bun:test";
import {
  DESIGN_LENS_HEADINGS,
  DESIGN_LENS_VERSION,
  validateDesignLensText,
} from "../scripts/check-feature-contract.ts";
import { readFileSync } from "node:fs";

const completeLens = (bodyFor = (heading: string) => `Domain-specific account for ${heading}.`) =>
  `# Design

Design-Lens-Version: ${DESIGN_LENS_VERSION}

## Open semantic system design lens

${DESIGN_LENS_HEADINGS.map((heading) => `### ${heading}\n\n${bodyFor(heading)}`).join("\n\n")}

## Acceptance

The executable oracle is separate.
`;

const rejection = (text: string): string => {
  try {
    validateDesignLensText(text, "design-specs/9999-fixture.md");
    return "accepted";
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
};

describe("open semantic system design-lens shape", () => {
  test("surfaces semantic layers, terminating slices, and explicit cycle progress", () => {
    const lens = readFileSync("docs/open-semantic-system-design.md", "utf8");
    const template = readFileSync("design-specs/TEMPLATE.md", "utf8");

    expect(lens).toContain("Layers, messages, and terminating slices");
    expect(lens).toContain("representation-preserving translation");
    expect(lens).toContain("prove runtime termination");
    expect(template).toContain("For each message");
    expect(template).toContain("intentional persistent-process meaning");
  });

  test("assigns enforcement claims only to boundaries that can observe them", () => {
    const lens = readFileSync("docs/open-semantic-system-design.md", "utf8");
    const template = readFileSync("design-specs/TEMPLATE.md", "utf8");

    expect(lens).toContain("## Enforcement ladder");
    expect(lens).toContain("A query cannot secretly");
    expect(lens).toContain("TypeScript's structural types disappear at runtime");
    expect(lens).toContain("claim-before-effect intent");
    expect(template).toContain("Do not assign a semantic claim to a gate that cannot");
  });

  test("keeps FSM, actor, supervision, and task-scope responsibilities orthogonal", () => {
    const lens = readFileSync("docs/open-semantic-system-design.md", "utf8");
    const template = readFileSync("design-specs/TEMPLATE.md", "utf8");

    expect(lens).toContain("### Recursive components and runtime realizations");
    expect(lens).toContain("FSM/statechart/reducer");
    expect(lens).toContain("Actor/process");
    expect(lens).toContain("OTP-style supervision");
    expect(lens).toContain("Structured concurrency");
    expect(lens).toContain("effect results re-enter as observations");
    expect(template).toContain("which separate responsibility each mechanism owns");
  });

  test("accepts domain-specific prose without keyword inference", () => {
    const text = completeLens((heading) => `A bounded answer written for ${heading}.`);
    expect(() => validateDesignLensText(text, "design-specs/9999-fixture.md")).not.toThrow();
  });

  test("rejects a missing, wrong, or duplicate version marker", () => {
    const valid = completeLens();
    expect(rejection(valid.replace(/^Design-Lens-Version:.*\n/m, ""))).toContain(
      "exactly one Design-Lens-Version",
    );
    expect(rejection(valid.replace(DESIGN_LENS_VERSION, "unknown-v9"))).toContain(
      `must be ${DESIGN_LENS_VERSION}`,
    );
    expect(
      rejection(
        valid.replace(
          `Design-Lens-Version: ${DESIGN_LENS_VERSION}`,
          `Design-Lens-Version: ${DESIGN_LENS_VERSION}\nDesign-Lens-Version: ${DESIGN_LENS_VERSION}`,
        ),
      ),
    ).toContain("found 2");
  });

  test("rejects a missing or duplicate required subsection", () => {
    const valid = completeLens();
    const heading = DESIGN_LENS_HEADINGS[0];
    expect(
      rejection(valid.replace(`### ${heading}\n\nDomain-specific account for ${heading}.`, "")),
    ).toContain(`"${heading}" must appear exactly once`);
    expect(
      rejection(
        valid.replace(
          `### ${heading}\n\nDomain-specific account for ${heading}.`,
          `### ${heading}\n\nFirst account.\n\n### ${heading}\n\nSecond account.`,
        ),
      ),
    ).toContain("found 2");

    const crossedHigherBoundary = valid.replace(
      `### ${DESIGN_LENS_HEADINGS[0]}`,
      `# A different top-level section\n\n### ${DESIGN_LENS_HEADINGS[0]}`,
    );
    expect(rejection(crossedHigherBoundary)).toContain(`"${DESIGN_LENS_HEADINGS[0]}" must appear`);
  });

  test("rejects comment-only and fenced-code-only placeholders", () => {
    const heading = DESIGN_LENS_HEADINGS[1];
    expect(
      rejection(
        completeLens((candidate) =>
          candidate === heading ? "<!-- explain later -->" : `Account for ${candidate}.`,
        ),
      ),
    ).toContain("placeholder-only");
    expect(
      rejection(
        completeLens((candidate) =>
          candidate === heading
            ? "```text\nplaceholder that is not a design account\n```"
            : `Account for ${candidate}.`,
        ),
      ),
    ).toContain("placeholder-only");
    expect(
      rejection(
        completeLens((candidate) =>
          candidate === heading ? "TODO: explain later" : `Account for ${candidate}.`,
        ),
      ),
    ).toContain("placeholder-only");
    expect(
      rejection(
        completeLens((candidate) =>
          candidate === heading ? "Coming soon." : `Account for ${candidate}.`,
        ),
      ),
    ).toContain("placeholder-only");
    expect(
      rejection(
        completeLens((candidate) =>
          candidate === heading ? "TODO 123" : `Account for ${candidate}.`,
        ),
      ),
    ).toContain("placeholder-only");
  });

  test("rejects an unfilled copy of the design-spec template", () => {
    const template = readFileSync("design-specs/TEMPLATE.md", "utf8");
    expect(rejection(template)).toContain("placeholder-only");
  });

  test("does not recognize markers or headings hidden in comments or code fences", () => {
    const commented = completeLens().replace(
      `Design-Lens-Version: ${DESIGN_LENS_VERSION}`,
      `<!--\nDesign-Lens-Version: ${DESIGN_LENS_VERSION}\n-->`,
    );
    expect(rejection(commented)).toContain("exactly one Design-Lens-Version");

    const fenced = `# Design

Design-Lens-Version: ${DESIGN_LENS_VERSION}

\`\`\`markdown
## Open semantic system design lens

${DESIGN_LENS_HEADINGS.map((heading) => `### ${heading}\n\nHidden account.`).join("\n\n")}
\`\`\`
    `;
    expect(rejection(fenced)).toContain('"Open semantic system design lens" section');

    const longFence = `# Design

\`\`\`\`
Design-Lens-Version: ${DESIGN_LENS_VERSION}

## Open semantic system design lens

${DESIGN_LENS_HEADINGS.map((heading) => `### ${heading}\n\nHidden account.`).join("\n\n")}
\`\`\`
`;
    expect(rejection(longFence)).toContain("exactly one Design-Lens-Version");

    const unclosedComment = completeLens().replace(
      `Design-Lens-Version: ${DESIGN_LENS_VERSION}`,
      `<!--\nDesign-Lens-Version: ${DESIGN_LENS_VERSION}`,
    );
    expect(rejection(unclosedComment)).toContain("exactly one Design-Lens-Version");
  });

  test("requires markers and ATX heading content on the same structural line", () => {
    const valid = completeLens();
    expect(
      rejection(
        valid.replace(
          `Design-Lens-Version: ${DESIGN_LENS_VERSION}`,
          `Design-Lens-Version:\n${DESIGN_LENS_VERSION}`,
        ),
      ),
    ).toContain(`must be ${DESIGN_LENS_VERSION}`);
    expect(
      rejection(
        valid.replace(
          "## Open semantic system design lens",
          "##\nOpen semantic system design lens",
        ),
      ),
    ).toContain('"Open semantic system design lens" section');
    expect(
      rejection(valid.replace(`### ${DESIGN_LENS_HEADINGS[0]}`, `###\n${DESIGN_LENS_HEADINGS[0]}`)),
    ).toContain(`"${DESIGN_LENS_HEADINGS[0]}" must appear exactly once`);
  });

  test("uses CommonMark-compatible fence and ATX-heading boundaries", () => {
    const withCommentSyntaxInsideFence = completeLens().replace(
      `## Open semantic system design lens`,
      `\`\`\`text
<!--
\`\`\`

## Open semantic system design lens`,
    );
    expect(() =>
      validateDesignLensText(withCommentSyntaxInsideFence, "design-specs/9999-fixture.md"),
    ).not.toThrow();

    const invalidBacktickInfo = completeLens().replace(
      `## Open semantic system design lens`,
      `\`\`\`bad\`info
## Open semantic system design lens`,
    );
    expect(() =>
      validateDesignLensText(invalidBacktickInfo, "design-specs/9999-fixture.md"),
    ).not.toThrow();

    const indentedClosingHashHeadings = completeLens()
      .replace("## Open semantic system design lens", "   ## Open semantic system design lens ##")
      .replace(`### ${DESIGN_LENS_HEADINGS[0]}`, `  ### ${DESIGN_LENS_HEADINGS[0]} ###`);
    expect(() =>
      validateDesignLensText(indentedClosingHashHeadings, "design-specs/9999-fixture.md"),
    ).not.toThrow();
  });

  test("reports static design-lens shape, never semantic correctness", () => {
    const message = rejection("# no marker or lens\n");
    expect(message).toContain("design-lens shape");
    expect(message.toLowerCase()).not.toContain("semantically correct");
    expect(message.toLowerCase()).not.toContain("architecture is valid");
  });
});
