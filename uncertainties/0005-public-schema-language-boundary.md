# Uncertainty 0005: public-schema language boundary

Status: open

## Current hypothesis

Keep the canonical project-model exporter in Python for the first Control Room
deployment, but replace the manually mirrored Python `TypedDict` and TypeScript
interface with one executable schema if a second consumer or schema revision
creates another synchronization burden.

The likely useful improvement is schema derivation, not a wholesale rewrite of
the canonical model in TypeScript.

## Supporting evidence

- The canonical loader, scheduler, validator, generator, and exporter already
  share one Python model and pass the repository gates.
- The independently found readiness bug disappeared when the exporter called
  the canonical scheduler; changing implementation language would not have
  prevented duplicated semantics.
- Oxfmt/Ruff formatting, missing CI tools, service-worker behavior,
  accessibility, and deployment provenance were tooling or boundary failures,
  not failures a TypeScript checker could prove away.
- Effect Schema or another runtime decoder could give the browser branded,
  validated timestamp, commit, digest, and observation-source values after
  decoding external JSON.

## Counterevidence

- `SnapshotMetadata` and `PublicSnapshot` are currently described separately in
  Python and TypeScript, so a required field can drift between producer and
  consumer.
- TypeScript discriminated unions could make locally validated
  `local_preview` and `accepted_main` states more explicit than unrefined
  strings.
- A single schema could generate fixtures and remove repetitive cross-language
  validation code.

## Downstream dependencies

- Any `semantic-public-snapshot-v2` revision.
- A second public-snapshot consumer.
- A private event-stream control plane.
- Evidence claims that rely on producer/consumer schema agreement.

## Resolving experiment

Before the next public-schema revision, compare three bounded prototypes against
the existing v1 fixtures:

1. JSON Schema as the source with generated Python and TypeScript types;
2. Effect Schema as the executable source with a generated portable schema;
3. the current hand-maintained producer and consumer validators.

Measure generated-code size, runtime validation coverage, error quality,
dependency weight, and whether the exact cross-record invariants—digest,
commit, and observation-time agreement—remain expressible without a second
source of truth.

Adopt a generator only if it removes the mirrored contract without moving
canonical scheduler semantics into the frontend or becoming an open-ended
language migration.
