---
format: semantic.feature-artifact/v1
feature_id: 0007-reuse-first-engineering
kind: specification
legacy_entity_id: work.reuse-first-engineering
---
# Design spec 0007: reuse-first engineering assignments

Status: frozen for implementation

Problem owner: operator and main research/integration agent

Frontier: developer delegation and implementation discipline

## User journey

When an implementation task is delegated, the engineer is explicitly prompted
to search the repository, installed tooling, established scaffolds, libraries,
and license-compatible prior art before hand-writing infrastructure. The worker
automates bounded repeatable work, stops when automation becomes an open-ended
side quest, and reports what it reused or rejected.

## Falsifiable claim

The durable agent map can make reuse-first engineering a required field of
every developer or engineer assignment without permitting copied code to
silently define project semantics or evidence.

The claim is falsified if the map:

- omits scaffold/tool/prior-art discovery;
- encourages unattributed or license-unknown copying;
- requires automation without a bounded stopping rule;
- lets reused code become semantic authority; or
- does not require the worker to report evaluated established options.

## Frozen contract

Every developer or engineer assignment requires five observable clauses:

1. search for existing commands, scaffolds, generators, libraries, and
   established patterns before hand-writing infrastructure;
2. reuse only license-compatible attributed code or techniques;
3. automate deterministic bounded repetition when cheaper to own;
4. stop automation before it becomes an unbounded side quest; and
5. report evaluated, reused, and rejected established options.

This changes delegation guidance only. It does not change language semantics,
evidence meanings, licenses, trusted code, or authority boundaries.

## Oracle

The acceptance command statically checks that the singular repository agent map
contains all five clauses. Review of actual delegation packets remains
`assertion` evidence; repository text cannot prove that every future worker
obeys its prompt.

## Acceptance

- `AGENTS.md` contains all five clauses under Delegation.
- The clauses preserve source/license provenance and project semantic authority.
- The acceptance command fails when any required clause is removed.
- Repository fast and integration gates remain green.

## Evidence and limits

The checked map and acceptance command are `static_analysis`. Review of future
prompts and worker reports is `assertion`. Neither proves license compatibility,
correct reuse, or compliance by every future agent.

## Kill criteria

Reopen the contract if it causes open-ended tool searches, makes trivial work
ceremonial, or encourages copying without provenance. Remove an automation rule
that costs more to maintain than the repeated work it replaces.

## Next uncertainty

Whether reuse-first prompting measurably reduces custom infrastructure and
review rework across three completed implementation assignments.
