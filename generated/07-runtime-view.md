# Runtime interaction view

<!-- Generated. Edit model sources, not this file. -->

Actor ownership, STM access, commit publication, and message delivery.

```mermaid
flowchart LR
    artifact_normalized_core["Normalized semantic core artifact"]
    component_artifact_distribution["Artifact and evidence distribution"]
    component_explorer["Semantic project explorer"]
    component_formal_evidence["Formal evidence adapters"]
    component_relational_analysis["Relational analysis plane"]
    component_resolver["Realization resolver"]
    deployment_control_room_pages["Control Room GitHub Pages deployment"]
    obligation_inventory_conformance["Inventory conformance obligation"]
    package_semantic_attestation_profile["Semantic attestation profile"]
    runtime_actors["Actor runtime"]
    runtime_inventory_actor["Inventory actor instance"]
    runtime_inventory_outbox["Commit outbox"]
    runtime_inventory_store["Inventory transactional store"]
    runtime_payment_actor["Payment actor"]
    runtime_stm["STM runtime"]
    component_resolver -->|handles| obligation_inventory_conformance
    component_formal_evidence -->|reads| artifact_normalized_core
    component_relational_analysis -->|reads| artifact_normalized_core
    component_artifact_distribution -->|publishes| package_semantic_attestation_profile
    component_resolver -->|reads| package_semantic_attestation_profile
    component_explorer -->|reads| component_relational_analysis
    runtime_inventory_actor -->|reads| runtime_inventory_store
    runtime_inventory_actor -->|writes| runtime_inventory_store
    runtime_stm -->|handles| runtime_inventory_store
    runtime_inventory_store -->|publishes| runtime_inventory_outbox
    runtime_inventory_outbox -->|sends| runtime_payment_actor
    runtime_actors -->|hosts| runtime_inventory_actor
    runtime_actors -->|hosts| runtime_payment_actor
    component_explorer -->|publishes| deployment_control_room_pages
```
