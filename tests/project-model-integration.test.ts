import { BunCrypto, BunFileSystem, BunPath } from "@effect/platform-bun";
import { describe, expect, test } from "bun:test";
import type { Crypto, FileSystem, Path } from "effect";
import { Effect } from "effect";
import { compileFeatureDossier } from "../src/project-model/feature-dossier.ts";
import {
  DESIGN_LENS_HEADINGS,
  DESIGN_LENS_VERSION,
} from "../src/project-model/design-lens-validation.ts";
import {
  FeatureDossierLoadError,
  loadFeatureDossier,
  loadFeatureDossiers,
} from "../src/project-model/loader.ts";
import { renderWorkFeatures, resolveFeature } from "../src/project-model/work-lifecycle.ts";

const featureId = "0058-feature-dossier-workflow";
const git = {
  format: "semantic.feature-git-observation/v1",
  feature_id: featureId,
  head: "head-1",
  clean: true,
};
const proposal = `---
format: semantic.feature-artifact/v1
feature_id: ${featureId}
kind: proposal
title: Dossier workflow
---

# Proposal
`;
const specification = `---
format: semantic.feature-artifact/v1
feature_id: ${featureId}
kind: specification
legacy_entity_id: work.feature-dossier-workflow
title: Dossier workflow specification
---

# Specification

Design-Lens-Version: ${DESIGN_LENS_VERSION}

## Open semantic system design lens

${DESIGN_LENS_HEADINGS.map((heading) => `### ${heading}\n\nThe dossier preserves ${heading}.`).join("\n\n")}
`;

const run = <A, E>(
  effect: Effect.Effect<A, E, Crypto.Crypto | FileSystem.FileSystem | Path.Path>,
): Promise<A> =>
  Effect.runPromise(
    effect.pipe(Effect.provide([BunCrypto.layer, BunFileSystem.layer, BunPath.layer])),
  );
const repositoryRoot = async (): Promise<string> => {
  const root = (await Bun.$`mktemp -d`.text()).trim();
  await Bun.$`mkdir -p ${root}/features/${featureId}`;
  return root;
};

test("loads and strictly compiles canonical feature artifacts", async () => {
  const repository = await repositoryRoot();
  await Bun.write(`${repository}/features/${featureId}/proposal.md`, proposal);
  await Bun.write(`${repository}/features/${featureId}/spec.md`, specification);
  await Bun.write(`${repository}/features/${featureId}/accept.ts`, "export const accept = true;\n");
  const input = await run(loadFeatureDossier(repository, featureId, { git }));
  expect(input.directory).toBe(`features/${featureId}`);
  expect(input.artifacts).toHaveLength(3);
  const dossier = await run(compileFeatureDossier(input));
  expect(dossier.feature_id).toBe(featureId);
  expect(dossier.lifecycle.phase.value).toBe("proposal");
  expect(dossier.facts.map((fact) => fact.path)).toEqual([
    `features/${featureId}/accept.ts`,
    `features/${featureId}/proposal.md`,
    `features/${featureId}/spec.md`,
  ]);
  const resolved = resolveFeature([dossier], featureId);
  expect(resolved).toMatchObject({
    featureId,
    entityId: "work.feature-dossier-workflow",
    designSpecPath: `features/${featureId}/spec.md`,
    planPath: `features/${featureId}/plan.md`,
    acceptance: { kind: "runnable", path: `features/${featureId}/accept.ts` },
  });
});

test("converts design-lens rejection into a typed loader failure", async () => {
  const repository = await repositoryRoot();
  const invalid = specification.replace(
    `Design-Lens-Version: ${DESIGN_LENS_VERSION}`,
    "Design-Lens-Version: unknown-v9",
  );
  await Bun.write(`${repository}/features/${featureId}/spec.md`, invalid);
  let failure: unknown;
  try {
    await run(loadFeatureDossier(repository, featureId, { git }));
  } catch (error) {
    failure = error;
  }
  expect(failure).toBeInstanceOf(FeatureDossierLoadError);
  expect(failure).toMatchObject({
    path: `features/${featureId}/spec.md`,
  });
  expect(String(failure)).toContain("design-lens version");
});

test("discovers orphan feature directories and rejects missing canonical specs", async () => {
  const repository = await repositoryRoot();
  const orphanId = "9999-orphan-dossier";
  await Bun.$`mkdir -p ${repository}/features/${orphanId}`;
  await Bun.write(`${repository}/features/${featureId}/spec.md`, specification);
  let failure: unknown;
  try {
    await run(loadFeatureDossiers(repository, { git }));
  } catch (error) {
    failure = error;
  }
  expect(failure).toBeInstanceOf(FeatureDossierLoadError);
  expect(failure).toMatchObject({
    path: `features/${orphanId}/spec.md`,
  });
});

test("generated work projection is a deterministic dossier view", async () => {
  const repository = await repositoryRoot();
  await Bun.write(`${repository}/features/${featureId}/proposal.md`, proposal);
  await Bun.write(`${repository}/features/${featureId}/spec.md`, specification);
  const input = await run(loadFeatureDossier(repository, featureId, { git }));
  const dossier = await run(compileFeatureDossier(input));
  const overlayDossier = await run(
    compileFeatureDossier({
      ...input,
      observations: {
        git: { ...git, head: "head-2" },
        provider: { requests: [], observations: [] },
        closure: [],
      },
    }),
  );
  const first = renderWorkFeatures([dossier]);
  const second = renderWorkFeatures([overlayDossier]);
  expect(first).toBe(second);
  expect(overlayDossier.observation_overlay.git.head).toBe("head-2");
  expect(first).toContain('"format": "semantic.feature-work-ir/v1"');
  expect(first).toContain(`"feature_id": "${featureId}"`);
  expect(first).not.toContain('"lifecycle"');
  expect(first).not.toContain('"queues"');
});

describe("canonical path boundary", () => {
  test("does not decode lifecycle status from artifact frontmatter", async () => {
    const repository = await repositoryRoot();
    await Bun.write(
      `${repository}/features/${featureId}/proposal.md`,
      proposal.replace("title: Dossier workflow", "title: Dossier workflow\nstatus: complete"),
    );
    await Bun.write(`${repository}/features/${featureId}/spec.md`, specification);
    await expect(run(loadFeatureDossier(repository, featureId, { git }))).rejects.toThrow();
  });
});
