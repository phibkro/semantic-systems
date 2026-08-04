---
format: semantic.feature-artifact/v1
feature_id: 0058-feature-dossier-workflow
kind: design
---
# Design: stable feature dossier cutover

Each migrated feature owns `spec.md`, `plan.md`, and `accept.ts` when those legacy artifacts existed. A `transitions/historical-import-v1.json` receipt records each removed legacy path, its exact pre-cutover SHA-256, historical status, and retained evidence categories. The receipt is explicitly non-authorizing.

The 0058 dossier additionally owns proposal, design, implementation report, verification, and transition artifacts. The feature identity is the full slugged directory name. The generated work projection remains a tooling output and is not hand-edited.
