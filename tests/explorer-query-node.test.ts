import assert from "node:assert/strict";
import test from "node:test";
import { Effect } from "effect";
import { queryExplorer } from "../src/explorer-query/index.ts";

test("genuine Node runs the storage-independent explorer query", async () => {
  const provenance = {
    source_schema: "semantic.project-model/v1",
    source_document: "model/node.json",
    source_record_kind: "entity" as const,
    source_record_key: "node",
  };
  const result = await Effect.runPromise(
    queryExplorer(
      {
        format: "semantic.explorer-fact-source",
        version: 1,
        facts: [
          {
            fact_type: "entity",
            fact_key: "entity:node",
            subject_id: "node",
            entity_kind: "component",
            status: null,
            name: "Node",
            provenance,
          },
        ],
      },
      {
        format: "semantic.explorer-query",
        version: 1,
        roots: ["node"],
        direction: "both",
        relation_families: [],
        relation_kinds: [],
        expansion: { default: "expanded", expanded_ids: [], collapsed_ids: [] },
        max_depth: 64,
        max_nodes: 1,
        view: "list",
      },
    ),
  );

  assert.deepEqual(
    result.nodes.map(({ canonical_identity }) => canonical_identity),
    ["node"],
  );
  assert.equal(result.projection.kind, "list");
  assert.equal(Object.isFrozen(result), true);
});
