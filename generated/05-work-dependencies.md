# Work dependencies

<!-- Generated. Edit model sources, not this file. -->

```mermaid
flowchart LR
    decision_one_shot["One-shot handlers by default"]
    decision_stm_library["STM is a library effect"]
    decision_theory_identity["Laws participate in semantic identity"]
    work_actor_runtime["Implement minimal actor runtime"]
    work_core_checker["Implement core checker"]
    work_inventory_actor["Implement inventory actor realization"]
    work_inventory_design["Complete inventory domain contract"]
    work_inventory_proof["Prove inventory invariant"]
    work_inventory_pure["Implement pure inventory realization"]
    work_inventory_stm["Implement inventory STM realization"]
    work_kernel_spec["Specify minimal kernel calculus"]
    work_package_resolver["Implement package and evidence resolver"]
    work_stm_laws["Specify STM effect and handler laws"]
    work_stm_model_check["Model-check STM interleavings"]
    work_stm_runtime["Implement minimal STM runtime"]
    work_theory_identity["Define normalized theory identity"]
    work_core_checker -->|blocks| work_kernel_spec
    work_kernel_spec -->|requires| decision_one_shot
    work_theory_identity -->|requires| decision_theory_identity
    work_package_resolver -->|blocks| work_theory_identity
    work_inventory_pure -->|blocks| work_inventory_design
    work_inventory_actor -->|blocks| work_inventory_design
    work_inventory_actor -->|blocks| work_actor_runtime
    work_stm_laws -->|requires| decision_stm_library
    work_stm_runtime -->|blocks| work_stm_laws
    work_inventory_stm -->|blocks| work_inventory_design
    work_inventory_stm -->|blocks| work_stm_runtime
    work_inventory_proof -->|blocks| work_inventory_design
    work_stm_model_check -->|blocks| work_stm_runtime
```

## Weighted critical path

Specify STM effect and handler laws → Implement minimal STM runtime → Model-check STM interleavings
