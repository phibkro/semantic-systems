---
format: semantic.feature-artifact/v1
feature_id: 0019-normalized-core-format
kind: implementation_report
---
# Historical source record: 0019-normalized-core-format

The following JSON is the verbatim legacy model record retained as historical evidence. Its lifecycle status and completion assertions are not current authority and cannot authorize a transition.

```json
{
  "entities": [
    {
      "id": "work.normalized-core-format",
      "kind": "work_item",
      "name": "Specify normalized core artifact",
      "summary": "Define the canonical checked representation, identity rules, source correspondence, and assumption encoding.",
      "status": "complete",
      "tags": ["semantics", "compiler"],
      "attributes": {
        "feature_id": "0019-normalized-core-format",
        "feature_loop": "managed",
        "phase": "validation",
        "effort": 8,
        "completion": {
          "outcome": "positive",
          "implementation_head": "a57d853db84e31a2e4ecccdd5506c030d84a59b5",
          "integration_head": "2959681e01df2acc4ea1318b8ce634b9ccf7d10c",
          "evidence": [
            {
              "role": "feature_acceptance",
              "category": "runtime_check",
              "method": "runtime_validation",
              "source": {
                "kind": "repository_artifact",
                "path": "plans/completed/0019-normalized-core-format.md"
              },
              "claim": "feature_acceptance: runtime_validation"
            },
            {
              "role": "integration_test",
              "category": "test",
              "method": "test_and_static_analysis",
              "source": {
                "kind": "repository_artifact",
                "path": "plans/completed/0019-normalized-core-format.md"
              },
              "claim": "integration_gate: test_and_static_analysis"
            },
            {
              "role": "integration_analysis",
              "category": "analysis",
              "method": "test_and_static_analysis",
              "source": {
                "kind": "repository_artifact",
                "path": "plans/completed/0019-normalized-core-format.md"
              },
              "claim": "integration_gate: test_and_static_analysis"
            },
            {
              "role": "independent_review",
              "category": "assertion",
              "method": "assertion",
              "source": { "kind": "authored_assertion" },
              "claim": "independent_review: assertion"
            }
          ]
        },
        "acceptance": [
          "Normalization is deterministic and documented",
          "Every entity and obligation has stable identity",
          "Source correspondence and assumptions are explicit",
          "The format is independent of Rust, Lean, MLIR, and Wasm"
        ],
        "delegation": {
          "specification_completeness": 3,
          "context_locality": 4,
          "testability": 4,
          "reversibility": 2,
          "integration_independence": 2,
          "blast_radius": 5,
          "human_review": true
        }
      }
    }
  ],
  "relations": []
}
```
