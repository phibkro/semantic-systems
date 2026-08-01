import assert from "node:assert/strict";
import test from "node:test";
import { NodeCrypto, NodePath } from "@effect/platform-node";
import { Effect } from "effect";
import {
  buildRelationalFactExport,
  queryEvidence,
  validateRelationalFactExportBytes,
} from "../src/project-model/relational-facts.ts";
import type { ProjectGraph } from "../src/project-model/types.ts";

const root = "/workspace";
const source = `${root}/model/node.json`;
const project: ProjectGraph = {
  root,
  entities: new Map(
    [
      ["claim.node", "claim"],
      ["obligation.node", "obligation"],
      ["evidence.node", "evidence"],
    ].map(([id, kind]) => [
      id!,
      {
        id: id!,
        kind: kind!,
        name: id!,
        summary: "",
        status: "current",
        tags: [],
        attributes: kind === "evidence" ? { evidence_type: "test" } : {},
        source,
      },
    ]),
  ),
  relations: [
    {
      sourceId: "obligation.node",
      targetId: "claim.node",
      kind: "discharges",
      summary: "",
      attributes: {},
      source,
    },
    {
      sourceId: "evidence.node",
      targetId: "obligation.node",
      kind: "supports",
      summary: "",
      attributes: {},
      source,
    },
  ],
};

test("genuine Node validates and queries the host-neutral relational export", async () => {
  const artifact = await Effect.runPromise(
    buildRelationalFactExport(project).pipe(Effect.provide([NodePath.layer, NodeCrypto.layer])),
  );
  const validated = await Effect.runPromise(
    validateRelationalFactExportBytes(artifact.bytes).pipe(Effect.provide(NodeCrypto.layer)),
  );
  const result = await Effect.runPromise(
    queryEvidence(artifact.bytes, {
      format: "semantic.evidence-query",
      version: 1,
      subject_ids: ["claim.node"],
      max_depth: 4,
      max_nodes: 8,
    }).pipe(Effect.provide(NodeCrypto.layer)),
  );

  assert.equal(validated.export_identity, artifact.export.export_identity);
  assert.deepEqual(
    result.matches.map(({ subject_id, minimum_depth }) => [subject_id, minimum_depth]),
    [
      ["obligation.node", 1],
      ["evidence.node", 2],
    ],
  );
});
