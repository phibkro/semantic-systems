# Evidence and trust map

<!-- Generated. Edit model sources, not this file. -->

```mermaid
flowchart TD
    assumption_memory_model["Target atomic memory model"]
    claim_inventory_invariant["Inventory transitions preserve non-negative quantities"]
    claim_model_valid["Bootstrap model is structurally valid"]
    claim_stm_serializable["STM commits are serializable"]
    evidence_inventory_proof["Inventory preservation proof"]
    evidence_inventory_tests["Inventory property tests"]
    evidence_model_tests["Project model tests"]
    evidence_stm_model["Bounded STM model check"]
    invariant_inventory_nonnegative["Non-negative inventory"]
    obligation_inventory_proof["Inventory preservation obligation"]
    realization_inventory_stm["Inventory STM realization"]
    work_inventory_proof["Prove inventory invariant"]
    evidence_model_tests -->|supports| claim_model_valid
    obligation_inventory_proof -->|discharges| claim_inventory_invariant
    evidence_inventory_tests -->|supports| claim_inventory_invariant
    evidence_inventory_proof -->|discharges| obligation_inventory_proof
    evidence_stm_model -->|supports| claim_stm_serializable
    claim_stm_serializable -->|assumes| assumption_memory_model
    claim_inventory_invariant -->|validates| invariant_inventory_nonnegative
    claim_stm_serializable -->|validates| realization_inventory_stm
    work_inventory_proof -->|discharges| obligation_inventory_proof
```

## Unsupported claims

- `claim.kernel.safety` — Kernel preserves typing
