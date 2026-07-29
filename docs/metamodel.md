# Typed Project Metamodel

## Entity families

| Family | Entity kinds |
|---|---|
| Semantic | theory, operation, law, effect, protocol, invariant, domain_machine, type |
| Architecture | component, package, realization, handler, runtime, artifact |
| Evidence | claim, obligation, evidence, assumption |
| Work | question, decision, work_item, milestone, gate |
| Execution | deployment, human, agent, responsibility, environment |

## Relation families

| Family | Relations |
|---|---|
| Structure | contains, refines, provides, requires |
| Semantics | extends, realizes, derives, preserves, implements |
| Evidence | supports, discharges, assumes, invalidates, covers, validates |
| Work | blocks, informs, changes, conflicts_with |
| Execution | selects, hosts, assigned_to, reviewed_by, accountable_for |
| Runtime | sends, reads, writes, publishes, handles |

## Recursive components

Containment is acyclic. Expanding a component reveals its internal system while
its external ports and contracts remain stable.

## Work does not inherit component lifecycle

One component may have semantics under research, an interface under design,
code under implementation, and benchmarks under optimization. Phases belong to
work items.

## Delegation metadata

Each work item records scores from 0–5 for:

- specification completeness;
- context locality;
- testability;
- reversibility;
- integration independence;
- blast radius.

The scheduler computes an advisory agentability score and identifies work whose
hard blockers and required decisions are complete.
