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
- An inventory state-machine tracer bullet with pure, actor, and STM
  realizations.
- A typed Python graph loader, validator, scheduler, and view generator.
- Canonical generated views:
  1. recursive system map;
  2. theory–realization map;
  3. concern matrix;
  4. evidence and trust graph;
  5. work dependencies and critical path;
  6. delegation frontier;
  7. runtime interaction view.
- Ruff, Pyright, and pytest configuration.

## Commands

Without installation:

```bash
PYTHONPATH=src python -m semantic_project_model validate
PYTHONPATH=src python -m semantic_project_model report
PYTHONPATH=src python -m semantic_project_model generate
PYTHONPATH=src pytest
```

After installation:

```bash
semproj validate
semproj report
semproj generate
```

Run every available check:

```bash
./scripts/check.sh
```

## Read next

- [`docs/constitution.md`](docs/constitution.md)
- [`docs/stratified-design.md`](docs/stratified-design.md)
- [`docs/metamodel.md`](docs/metamodel.md)
- [`docs/research-program.md`](docs/research-program.md)
- [`examples/inventory/README.md`](examples/inventory/README.md)
- [`generated/README.md`](generated/README.md)
