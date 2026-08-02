# Semantic Systems Project Bootstrap

This repository turns the accumulated language-design brainstorm into a
machine-checkable research and development project.

The source of truth is a **federated typed graph**. Semantic contracts,
architecture, evidence, work, runtime interactions, deployments, and
responsibility are represented separately and connected by stable IDs.
Markdown and Mermaid diagrams are generated projections of that graph.

## Included

- A stratified design from kernel to distributable theories, realizations,
  evidence, and deployments.
- A completed inventory state-machine tracer bullet with a lawful pure
  realization, a standing broken realization, typed example-test evidence,
  policy resolution, execution, and structured explanations. Actor and STM
  realizations remain planned.
- A strict TypeScript/Effect v4 graph loader, validator, scheduler, and view
  generator running on Bun.
- Canonical generated views:
  1. recursive system map;
  2. theory–realization map;
  3. concern matrix;
  4. evidence and trust graph;
  5. work dependencies and critical path;
  6. delegation frontier;
  7. runtime interaction view.
- Bun, Effect v4, strict TypeScript, Oxfmt, and Oxlint configuration across
  the project model, tracer, actor, reference custody, tests, and checks.

## Commands

Enter the pinned development environment:

```bash
nix develop
```

Run the Effect v4 inventory tracer:

```bash
bun run semantic-tracer -- demo examples/inventory
```

Run the Effect v4 project model:

```bash
bun run semproj -- validate
bun run semproj -- report
bun run semproj -- generate
bun test tests/project-model.test.ts
```

Run the Effect v4 reference-custody CLI:

```bash
bun run semrefs -- catalog-check
bun run semrefs -- status --all --lock-only --json
```

The checked-in reference lock retains its historical generator identity;
current commands do not rewrite locked source facts merely to rename the
implementation.

Run every available check:

```bash
just check
```

The model intentionally retains a warning for the unsupported future
`claim.kernel.safety` claim.

## Read next

- [`docs/constitution.md`](docs/constitution.md)
- [`docs/stratified-design.md`](docs/stratified-design.md)
- [`docs/metamodel.md`](docs/metamodel.md)
- [`docs/research-program.md`](docs/research-program.md)
- [`examples/inventory/README.md`](examples/inventory/README.md)
- [`generated/README.md`](generated/README.md)
