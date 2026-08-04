# Semantic Systems

This repository turns semantic-system research into a machine-checkable project.
The trusted source is a federated typed graph for contracts, architecture,
evidence, work, runtime interactions, deployments, and responsibility.
Generated diagrams and JSON are projections of those sources.

## Included

- Stratified semantic contracts and executable realizations.
- Strict TypeScript and Effect v4 project-model tooling running on Bun.
- Deterministic system, theory, evidence, work, delegation, runtime, and feature
  lifecycle views.
- Canonical feature dossiers with strict artifact metadata, typed transition
  receipts, and revision-bound observations.

## Canonical feature dossiers

A feature keeps one stable identity at `features/<id>/`. Its authored lifecycle
artifacts are `proposal.md`, optional `research.md` or `research/`, optional
`design.md`, `spec.md`, `plan.md`, `implementation-report.md`, `accept.ts`,
`verification/`, and `transitions/`. Frontmatter uses
`semantic.feature-artifact/v1`; lifecycle status is derived from accepted
receipts and observations. Do not edit generated projections by hand.

## Commands

Enter the pinned environment:

```bash
nix develop
```

Use only the four repository workflow families:

```bash
just setup
just check
just verify
just start <feature-id>
```

`just check` repairs only Oxfmt output, Oxlint safe fixes, and deterministic
generated views. It reports changed paths and fails on undeclared or
non-idempotent repairs. `just verify` requires an exact clean tracked head and
never writes. `just start` creates at most one matching branch, worktree, and
local lease; a repeated matching request is idempotent.

The dossier projection CLI is an explicit feature lifecycle command:

```bash
bun run semproj -- feature validate --feature <feature-id>
```

It reads the live canonical dossier, strictly decodes it, verifies artifact
content hashes, and reports derived lifecycle dimensions with their sources.

## Read next

- [`docs/constitution.md`](docs/constitution.md)
- [`docs/stratified-design.md`](docs/stratified-design.md)
- [`docs/metamodel.md`](docs/metamodel.md)
- [`generated/README.md`](generated/README.md)
