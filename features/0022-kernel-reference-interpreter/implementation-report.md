---
format: semantic.feature-artifact/v1
feature_id: 0022-kernel-reference-interpreter
kind: implementation_report
---
# Historical source record: 0022-kernel-reference-interpreter

The following JSON is the verbatim legacy model record retained as historical evidence. Its lifecycle status and completion assertions are not current authority and cannot authorize a transition.

```json
{
  "entities": [
    {
      "id": "work.kernel-reference-interpreter",
      "kind": "work_item",
      "name": "Establish the kernel reference interpreter",
      "summary": "Compose the stable kernel JSON boundary, authoritative checker, and bounded CBPV machine into one implementation-neutral execution observation that becomes the optimized compiler's differential oracle.",
      "status": "complete",
      "tags": ["language", "kernel", "interpreter", "cbpv", "property-testing"],
      "attributes": {
        "feature_id": "0022-kernel-reference-interpreter",
        "feature_loop": "managed",
        "phase": "validation",
        "effort": 8,
        "completion": {
          "outcome": "positive",
          "implementation_head": "c660b657ee951a65328a485bbaf6762d90a07910",
          "integration_head": "c660b657ee951a65328a485bbaf6762d90a07910",
          "evidence": [
            {
              "role": "feature_acceptance",
              "category": "runtime_check",
              "method": "runtime_validation",
              "source": {
                "kind": "repository_artifact",
                "path": "plans/completed/0022-kernel-reference-interpreter.md"
              },
              "claim": "feature_acceptance: runtime_validation"
            },
            {
              "role": "integration_test",
              "category": "test",
              "method": "test_and_static_analysis",
              "source": {
                "kind": "repository_artifact",
                "path": "plans/completed/0022-kernel-reference-interpreter.md"
              },
              "claim": "integration_gate: test_and_static_analysis"
            },
            {
              "role": "integration_analysis",
              "category": "analysis",
              "method": "test_and_static_analysis",
              "source": {
                "kind": "repository_artifact",
                "path": "plans/completed/0022-kernel-reference-interpreter.md"
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
          "Agent-facing kernel JSON runs through one documented reference interpreter",
          "Invalid representation and semantic programs remain in their owning rejection phase",
          "Runtime observations exclude implementation-specific traces and token identities",
          "Property generators are seeded, shrinking, bounded, and grammar-aware",
          "Future compiler acceptance requires canonical differential agreement"
        ],
        "delegation": {
          "specification_completeness": 5,
          "context_locality": 5,
          "testability": 5,
          "reversibility": 5,
          "integration_independence": 4,
          "blast_radius": 3,
          "human_review": true
        }
      }
    }
  ],
  "relations": []
}
```
