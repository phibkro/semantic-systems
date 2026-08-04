---
format: semantic.feature-artifact/v1
feature_id: 0052-stm-schedule-explorer
kind: implementation_report
---
# Historical source record: 0052-stm-schedule-explorer

The following JSON is the verbatim legacy model record retained as historical evidence. Its lifecycle status and completion assertions are not current authority and cannot authorize a transition.

```json
{
  "entities": [
    {
      "id": "work.stm-model-check",
      "kind": "work_item",
      "name": "Model-check STM interleavings",
      "summary": "Enumerate deterministic bounded commit, abort, retry, and wake-up schedules, classify closed properties, and replay canonical counterexamples.",
      "status": "complete",
      "tags": ["stm", "validation", "model-checking", "determinism"],
      "attributes": {
        "feature_id": "0052-stm-schedule-explorer",
        "feature_loop": "managed",
        "phase": "validation",
        "effort": 13,
        "completion": {
          "outcome": "positive",
          "implementation_head": "a6e19d719b41b1df262f7d67ae653dea43b44a73",
          "integration_head": "6536fbe03fe2d25bc7e0776312092a04508c5c24",
          "evidence": [
            {
              "role": "feature_acceptance",
              "category": "runtime_check",
              "method": "runtime_validation",
              "source": {
                "kind": "repository_artifact",
                "path": "plans/completed/0052-stm-schedule-explorer.md"
              },
              "claim": "feature_acceptance: runtime_validation"
            },
            {
              "role": "integration_test",
              "category": "test",
              "method": "test_and_static_analysis",
              "source": {
                "kind": "repository_artifact",
                "path": "plans/completed/0052-stm-schedule-explorer.md"
              },
              "claim": "integration_gate: test_and_static_analysis"
            },
            {
              "role": "integration_analysis",
              "category": "analysis",
              "method": "test_and_static_analysis",
              "source": {
                "kind": "repository_artifact",
                "path": "plans/completed/0052-stm-schedule-explorer.md"
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
          "Two-transaction contention exhausts declared bounds and holds serializable_commits, no_partial_publication, and relevant_retry_wakeup",
          "A retry deadlock returns the shortest canonical all_transactions_terminal counterexample and exact replay reproduces its projection and finding",
          "Relevant and unrelated retry dependency changes remain distinct",
          "Invalid bounds, duplicate transaction IDs, cross-domain descriptions, and replay choices are typed diagnostics",
          "Reports expose bounds, assumptions, unsupported claims, bounded status, and no proof or liveness upgrade",
          "Bun and genuine Node report entrypoints emit byte-identical canonical output"
        ],
        "delegation": {
          "specification_completeness": 5,
          "context_locality": 5,
          "testability": 5,
          "reversibility": 4,
          "integration_independence": 5,
          "blast_radius": 4,
          "human_review": true
        }
      }
    }
  ],
  "relations": []
}
```
