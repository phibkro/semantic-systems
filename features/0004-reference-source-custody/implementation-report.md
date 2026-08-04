---
format: semantic.feature-artifact/v1
feature_id: 0004-reference-source-custody
kind: implementation_report
---
# Historical source record: 0004-reference-source-custody

The following JSON is the verbatim legacy model record retained as historical evidence. Its lifecycle status and completion assertions are not current authority and cannot authorize a transition.

```json
{
  "entities": [
    {
      "id": "work.reference-source-custody",
      "kind": "work_item",
      "name": "Establish reference-source custody",
      "summary": "Lock and materialize reference sources from exact committed Git objects while keeping origin, license, provenance, and semantic fitness distinct.",
      "status": "complete",
      "tags": ["references", "custody", "evidence"],
      "attributes": {
        "feature_id": "0004-reference-source-custody",
        "feature_loop": "pre_loop",
        "phase": "validation",
        "effort": 8,
        "acceptance": [
          "Catalog and lock records preserve canonical source identity and exact committed bytes",
          "Offline and remote materialization fail closed without unsafe network or working-tree mutation",
          "Adversarial fixtures cover path confinement, cache atomicity, catalog-lock correspondence, and complete checkout shape",
          "Evidence limits distinguish local observations from origin truth, legal compatibility, and semantic fitness"
        ],
        "delegation": {
          "specification_completeness": 5,
          "context_locality": 5,
          "testability": 5,
          "reversibility": 5,
          "integration_independence": 4,
          "blast_radius": 3,
          "human_review": true
        },
        "completion": {
          "outcome": "positive",
          "evidence": [
            {
              "role": "status_basis",
              "category": "assertion",
              "method": "authored_completion_state",
              "source": {
                "kind": "repository_artifact",
                "path": "plans/completed/0004-reference-source-custody.md"
              },
              "claim": "Complete. Deterministic positive and adversarial fixtures, two independent counterexample rounds, the real offline `local.lang-bang` scenario, full repository validation, a generated exact lock, and explicit evidence limits are recorded."
            }
          ]
        }
      }
    }
  ],
  "relations": []
}
```
