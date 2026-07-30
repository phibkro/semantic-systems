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
  });

  test("reports static design-lens shape, never semantic correctness", () => {
    const message = rejection("# no marker or lens\n");
    expect(message).toContain("design-lens shape");
    expect(message.toLowerCase()).not.toContain("semantically correct");
    expect(message.toLowerCase()).not.toContain("architecture is valid");
  });
});
