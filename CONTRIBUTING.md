# Contributing

## Change the source, not generated views

Edit files under `model/`, then run:

```bash
semproj validate
semproj generate
```

Commit model and generated-view changes together.

## Quality gates

```bash
ruff check .
ruff format --check .
pyright
pytest
semproj validate
semproj generate --check
```

## New semantic features

A proposal should identify:

- the semantic distinction;
- whether it belongs in the kernel, standard abstractions, or syntax sugar;
- interactions with effects, ownership, propositions, and polymorphism;
- required runtime machinery;
- evidence obligations;
- one nontrivial tracer-bullet use.

## New work items

Every work item requires:

- a phase;
- acceptance criteria;
- delegation metadata;
- explicit blockers and decisions;
- the components, theories, or evidence artifacts it changes.
