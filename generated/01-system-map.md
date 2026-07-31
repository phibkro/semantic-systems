# System map

<!-- Generated. Edit model sources, not this file. -->

Recursive component and package containment.

```mermaid
flowchart TD
    component_artifact_distribution["Artifact and evidence distribution"]
    component_compiler["Compiler"]
    component_component_backend["Portable component backend"]
    component_ecosystem["Package ecosystem"]
    component_elaborator["Surface elaborator"]
    component_examples["Executable examples"]
    component_explorer["Semantic project explorer"]
    component_formal_evidence["Formal evidence adapters"]
    component_incremental_queries["Incremental semantic query engine"]
    component_inventory["Inventory tracer bullet"]
    component_kernel["Trusted kernel"]
    component_language["Language system"]
    component_optimization_bridge["Optimization bridge"]
    component_project["Semantic systems project"]
    component_project_model["Project graph tooling"]
    component_registry["Registry"]
    component_relational_analysis["Relational analysis plane"]
    component_resolver["Realization resolver"]
    component_runtime["Runtime system"]
    component_semantic_system_kernel["Executable semantic system kernel"]
    component_syntax["Lossless syntax system"]
    handler_inventory_events["Inventory event handler"]
    realization_inventory_actor["Inventory actor realization"]
    realization_inventory_broken["Standing broken inventory realization"]
    realization_inventory_pure["Inventory pure realization"]
    realization_inventory_stm["Inventory STM realization"]
    runtime_actors["Actor runtime"]
    runtime_deterministic_simulator["Deterministic concurrency simulator"]
    runtime_effects["Effect runtime"]
    runtime_stm["STM runtime"]
    component_project -->|contains| component_language
    component_project -->|contains| component_ecosystem
    component_project -->|contains| component_runtime
    component_project -->|contains| component_project_model
    component_project -->|contains| component_examples
    component_language -->|contains| component_kernel
    component_language -->|contains| component_elaborator
    component_language -->|contains| component_compiler
    component_compiler -->|contains| component_resolver
    component_ecosystem -->|contains| component_registry
    component_runtime -->|contains| runtime_effects
    component_runtime -->|contains| runtime_actors
    component_runtime -->|contains| runtime_stm
    component_examples -->|contains| component_inventory
    component_inventory -->|contains| realization_inventory_pure
    component_inventory -->|contains| realization_inventory_actor
    component_inventory -->|contains| realization_inventory_stm
    component_inventory -->|contains| handler_inventory_events
    component_inventory -->|contains| realization_inventory_broken
    component_project -->|contains| component_semantic_system_kernel
    component_language -->|contains| component_syntax
    component_compiler -->|contains| component_incremental_queries
    component_compiler -->|contains| component_optimization_bridge
    component_compiler -->|contains| component_component_backend
    component_project -->|contains| component_formal_evidence
    component_project_model -->|contains| component_relational_analysis
    component_ecosystem -->|contains| component_artifact_distribution
    component_runtime -->|contains| runtime_deterministic_simulator
    component_project_model -->|contains| component_explorer
```
