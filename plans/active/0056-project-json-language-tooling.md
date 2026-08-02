# Plan 0056-project-json-language-tooling: schema-backed model editing

Canonical frozen contract: [`design-specs/0056-project-json-language-tooling.md`](../../design-specs/0056-project-json-language-tooling.md).
This mutable ledger records execution evidence and does not own schema truth.

Feature base: `3d56978`

Owner: primary Semantic Systems integration lead

## Goal

Give canonical project JSON standard completion and immediate structural
diagnostics from a deterministic projection of the Effect v4 input schemas.

## Fixed boundaries

- Keep Effect schemas as the only authored structural source.
- Keep `semproj validate` as the semantic graph authority.
- Reuse the maintained VS Code JSON language service; add no custom server.
- Generate one Draft 2020-12 projection under `generated/schema/`.
- Preserve dirty operator-owned `AGENTS.md`.

## Execution slices

### Red tracer

1. Add known-good and known-bad language-service observations.
2. Add deterministic projection and LSP-association assertions.
3. Observe failure before implementing the generator.

### Canonical source and projection

1. Export the existing Effect v4 project-document decoder schema.
2. Reuse lifecycle metadata schemas and closed kind vocabularies.
3. Add the schema projection to the existing `semproj generate` pipeline.
4. Move the stale hand-authored schema to the generated custody path.

### Standard language tooling

1. Pin the maintained `vscode-json-languageservice` development dependency.
2. Associate canonical model JSON through repository `.omp/lsp.json`.
3. Keep semantic validation separate and executable.

### Integration and review

1. Run focused tests and exact acceptance.
2. Run a fresh-agent cold dogfood task and record friction.
3. Run release replay and independent exact-head review.
4. Record typed completion evidence and close this ledger.

## Acceptance command

```text
just accept 0056-project-json-language-tooling
```

## Evidence ledger

- 2026-08-02: OMP exposes a generic LSP configuration surface and the installed
  `vscode-json-language-server`, but no JSON server was configured.
- 2026-08-02: the project already had an unbound hand-authored schema whose entity
  and relation kinds had drifted to unconstrained strings. The Effect v4 decoder
  and lifecycle schema are the existing runtime sources.
