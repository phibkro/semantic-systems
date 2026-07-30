# Active plan 0012: minimal actor runtime

Canonical problem contract:
[`design-specs/0012-minimal-actor-runtime.md`](../../design-specs/0012-minimal-actor-runtime.md).
This mutable execution record must not redefine the frozen contract.

Status: revision 2 green locally; fresh exact-head review required

Owner: main integration agent

## Current state

- The pure inventory transition, replay function, deterministic scenario, and
  exact semantic identities are integrated and green.
- Effect v4 beta.102 and the official Bun/Node platform layers are pinned.
- The portable actor runtime, inventory adapter, Bun/Node composition roots,
  bounded journey, and acceptance program now exist in the feature worktree.
- A mutable-alias counterexample invalidated the first ownership
  implementation. Revision 1 now copies values at each ownership boundary and
  rejects non-transferable values with typed failures.
- The ready-frontier item `work.actor-runtime` supplies the initial acceptance
  envelope, but this plan and design spec own the executable feature boundary.

## Owned paths

- `design-specs/0012-minimal-actor-runtime.md` (frozen after this commit);
- `plans/active/0012-minimal-actor-runtime.md`;
- `scripts/accept/0012-minimal-actor-runtime.ts`;
- `scripts/oxlint/semantic-effect-rules.ts` only to add the actor portable
  closure and its two composition-root exclusions;
- `src/actor/**`;
- `tests/actor-runtime.test.ts` and
  `tests/actor-runtime-node.test.ts`;
- the smallest inventory-domain refactor required to expose the existing
  fresh-identifier seam;
- `package.json` command additions;
- `model/work/work.json` status and contract reference;
- generated projections derived from canonical model changes; and
- documentation/provenance directly describing this tracer.

## Forbidden paths and meanings

- reference custody, checker-policy, project-model, governance, hook, CI, Nix,
  and unrelated generated implementation;
- inventory theory, law, invariant, observation, obligation, normalized
  identity, resolver, evidence-category, or trust-policy meaning;
- external actor frameworks, hosted services, Pagu, remote infrastructure, or
  real deployment;
- STM, persistence, remoting, restart supervision, or benchmarking.

## Implementation slices

1. Record discriminating red oracles and a counterexample manifest.
2. Implement the portable scoped actor deep module over Effect primitives.
3. Refactor the inventory fresh-identifier request seam without changing pure
   observations.
4. Implement the inventory actor adapter and deterministic fresh-ID layer.
5. Add Bun and Node composition roots plus canonical observation output.
6. Add portable transitive-import and public-surface checks.
7. Run focused and neighboring inventory gates.
8. Commission independent semantic/concurrency review and correct findings.
9. Run exact-head feature, integration, and preview gates; update canonical
   execution state without upgrading evidence.

## Acceptance commands

```bash
bun test tests/actor-runtime.test.ts
bun run typecheck
bun run lint
bunx oxfmt --check src/actor tests/actor-runtime.test.ts scripts/accept/0012-minimal-actor-runtime.ts
bun scripts/accept/0012-minimal-actor-runtime.ts
node src/actor/main-node.ts examples/inventory/scenarios/demo.json
git diff --check
```

Before integration:

```bash
nix develop --command just fast
nix develop --command just check
nix develop --command just accept 0012-minimal-actor-runtime
```

## Required evidence

- observed-red reason for every counterexample family;
- focused Bun tests and exact assertion count;
- Bun/Node normalized observation equality;
- existing inventory tracer regression results;
- portable import-closure result;
- exact compatibility pins;
- independent review and resolved findings;
- semantic diff, assumptions, unsupported guarantees, and commands not run.

## Delegation contract

Implementation autonomy is A3 in one isolated worktree based on the exact
contract commit. A worker may implement and commit within owned paths but may
not revise this design spec, change semantic identities, select stronger actor
guarantees, add dependencies, or integrate its own work.

Every implementation assignment must name the exact base, owned and forbidden
paths, acceptance commands, expected deliverables, and this posture:

- search the repository, Effect v4 beta.102, and installed tooling for an
  existing primitive or established pattern before hand-writing machinery;
- reuse compatible upstream techniques with source and license provenance;
- automate only deterministic bounded repetition cheaper than manual work;
  and
- stop any abstraction or generator side quest once the smallest frozen
  tracer can be implemented directly.

## Risks

- Effect beta APIs may encourage implementation-shaped semantics; the frozen
  trace and runtime-neutral contract remain authoritative.
- Caller interruption and bounded-queue acceptance can be observed at the
  wrong boundary unless acceptance sequence assignment and enqueue are one
  uninterruptible operation.
- Graceful drain and scope finalization can deadlock if close is represented as
  an ordinary message after acceptance is disabled.
- A returned state snapshot would silently weaken unique ownership even if
  typed read-only.
- Bun/Node equality can self-validate if both entrypoints share an incorrect
  core; adversarial tests and independent review remain required.

## Progress log

- 2026-07-30: frozen the first actor tracer around receiver-local FIFO,
  bounded backpressure, actor-private state, scoped graceful close, typed
  transition failure, deterministic fresh identifiers, and pure-inventory
  equivalence. Stronger delivery, scheduling, durability, and proof claims are
  explicitly excluded.
- 2026-07-30: observed the initial missing-test acceptance gate fail because
  `tests/actor-runtime.test.ts` did not exist. The first implementation then
  passed six focused counterexamples and the full bounded acceptance journey.
  This records one process deviation: not every original counterexample family
  had a separately retained pre-implementation red execution.
- 2026-07-30: adversarial ownership inspection found that opaque references
  alone did not prevent caller aliases to initial state, accepted messages, or
  transition outputs. Revised the frozen boundary explicitly, added five
  discriminating transfer/alias counterexamples, and implemented
  structured-clone transfer. Twelve focused tests (33 expectations),
  TypeScript, and Oxlint are green; exact acceptance and independent review
  must be rerun before integration.
- 2026-07-30: independent exact-head review rejected `e67686d`. Node preserved
  `SharedArrayBuffer` backing where Bun copied it; invalid scenario steps
  shifted the actor's deterministic freshness sequence; and the worker retained
  the caller-mutable actor-definition container. Revision 2 excludes shared
  memory, derives freshness from `prepareReferenceTransition`, snapshots
  definition fields, and adds genuine-Node plus adversarial Bun gates. The
  rejected head remains runtime-validation evidence only and is not
  integrable.
- 2026-07-30: revision 2 passes 15 focused Bun tests (42 expectations), one
  genuine-Node shared-memory test, TypeScript, Oxlint, formatting, all 64
  neighboring inventory tests (429 expectations), the semantic lint suite,
  model validation, generated-view drift, Bun/Node demo parity, and the
  guarded-freshness equivalence counterexample. These are local test,
  static-analysis, and runtime-validation results; a fresh independent review
  is still required.
- 2026-07-30: independent review rejected `af5c398` because stringifying a
  caller-controlled traversal failure could itself throw, turning a declared
  transfer error into a defect. Revision 3 uses total cause rendering and adds
  hostile initial-state, message, and transition-output probes under Bun and
  Node. The focused result is now 16 Bun tests (45 expectations) and two
  genuine-Node tests; the full exact-head acceptance and another independent
  review remain required.
