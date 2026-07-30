# Work dependencies

<!-- Generated. Edit model sources, not this file. -->

```mermaid
flowchart LR
    decision_gated_autonomous_merges["Gate autonomous feature merges"]
    decision_one_shot["One-shot handlers by default"]
    decision_stm_library["STM is a library effect"]
    decision_theory_identity["Laws participate in semantic identity"]
    work_actor_runtime["Implement minimal actor runtime"]
    work_autonomous_development_loop["Establish the autonomous development control loop"]
    work_core_checker["Implement core checker"]
    work_deterministic_simulator_spec["Design deterministic concurrency simulator"]
    work_explorer_query_contract["Specify explorer query contract"]
    work_inventory_actor["Implement inventory actor realization"]
    work_inventory_design["Complete inventory domain contract"]
    work_inventory_proof["Prove inventory invariant"]
    work_inventory_pure["Implement pure inventory realization"]
    work_inventory_resolution_tracer["Complete inventory evidence-resolution tracer"]
    work_inventory_stm["Implement inventory STM realization"]
    work_kernel_spec["Specify minimal kernel calculus"]
    work_lean_evidence_adapter["Specify Lean evidence adapter"]
    work_lossless_frontend_spec["Design lossless incremental frontend"]
    work_normalized_core_format["Specify normalized core artifact"]
    work_package_resolver["Implement package and evidence resolver"]
    work_relational_fact_schema["Define relational fact export"]
    work_semantic_attestation_profile["Specify semantic attestation profile"]
    work_stm_laws["Specify STM effect and handler laws"]
    work_stm_model_check["Model-check STM interleavings"]
    work_stm_runtime["Implement minimal STM runtime"]
    work_theory_identity["Define normalized theory identity"]
    work_translation_validation_spec["Specify translation-validation seams"]
    work_wasm_contract_mapping["Research semantic contracts to WIT mapping"]
    decision_gated_autonomous_merges -->|informs| work_autonomous_development_loop
    work_inventory_resolution_tracer -->|requires| decision_theory_identity
    work_normalized_core_format -->|blocks| work_kernel_spec
    work_lossless_frontend_spec -->|blocks| work_normalized_core_format
    work_lean_evidence_adapter -->|blocks| work_normalized_core_format
    work_translation_validation_spec -->|blocks| work_normalized_core_format
    work_semantic_attestation_profile -->|blocks| work_theory_identity
    work_wasm_contract_mapping -->|blocks| work_normalized_core_format
    work_deterministic_simulator_spec -->|blocks| work_stm_laws
    work_explorer_query_contract -->|informs| work_relational_fact_schema
    work_core_checker -->|blocks| work_kernel_spec
    work_kernel_spec -->|requires| decision_one_shot
    work_theory_identity -->|requires| decision_theory_identity
    work_package_resolver -->|blocks| work_theory_identity
    work_inventory_pure -->|blocks| work_inventory_design
    work_inventory_actor -->|blocks| work_inventory_design
    work_inventory_actor -->|blocks| work_actor_runtime
    work_stm_laws -->|informs| decision_stm_library
    work_stm_runtime -->|blocks| work_stm_laws
    work_inventory_stm -->|blocks| work_inventory_design
    work_inventory_stm -->|blocks| work_stm_runtime
    work_inventory_proof -->|blocks| work_inventory_design
    work_stm_model_check -->|blocks| work_stm_runtime
```

## Weighted critical path

Specify STM effect and handler laws → Implement minimal STM runtime → Model-check STM interleavings
