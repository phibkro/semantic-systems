import { BunCrypto, BunFileSystem, BunPath } from "@effect/platform-bun";
import { describe, expect, test } from "bun:test";
import type { Crypto, FileSystem, Path } from "effect";
import { Effect } from "effect";
import { compileFeatureDossier } from "../src/project-model/feature-dossier.ts";
import { loadFeatureDossier } from "../src/project-model/loader.ts";
import { renderWorkFeatures } from "../src/project-model/work-lifecycle.ts";

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
title: Dossier workflow specification
---

# Specification
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
  const input = await run(loadFeatureDossier(repository, featureId, { git }));
  expect(input.directory).toBe(`features/${featureId}`);
  expect(input.artifacts).toHaveLength(2);
  const dossier = await run(compileFeatureDossier(input));
  expect(dossier.feature_id).toBe(featureId);
  expect(dossier.lifecycle.phase.value).toBe("proposal");
  expect(dossier.facts.map((fact) => fact.path)).toEqual([
    `features/${featureId}/proposal.md`,
    `features/${featureId}/spec.md`,
  ]);
});

test("generated work projection is a deterministic dossier view", async () => {
  const repository = await repositoryRoot();
  await Bun.write(`${repository}/features/${featureId}/proposal.md`, proposal);
  const input = await run(loadFeatureDossier(repository, featureId, { git }));
  const dossier = await run(compileFeatureDossier(input));
  const first = renderWorkFeatures([dossier]);
  const second = renderWorkFeatures([dossier]);
  expect(first).toBe(second);
  expect(first).toContain('"format": "semantic.feature-work-ir/v1"');
  expect(first).toContain(`"feature_id": "${featureId}"`);
});

describe("canonical path boundary", () => {
  test("does not decode lifecycle status from artifact frontmatter", async () => {
    const repository = await repositoryRoot();
    await Bun.write(
      `${repository}/features/${featureId}/proposal.md`,
      proposal.replace("title: Dossier workflow", "title: Dossier workflow\nstatus: complete"),
    );
    await expect(run(loadFeatureDossier(repository, featureId, { git }))).rejects.toThrow();
  });
});
