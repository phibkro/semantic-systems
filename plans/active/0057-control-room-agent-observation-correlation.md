# Plan 0057-control-room-agent-observation-correlation: Control Room agent observation correlation

Frozen contract: [`design-specs/0057-control-room-agent-observation-correlation.md`](../../design-specs/0057-control-room-agent-observation-correlation.md)

Feature base: `de99c9f196da61c6a19c9f1aaf0e3513b4e64c63`

Owner: primary Semantic Systems lead

## Goal

Deliver one executable, bounded, vendor-neutral tracer bullet. It decodes one offline Langfuse or ClickStack capture, verifies its source digest and bounds, correlates only explicit PBK identities, and returns one deterministic read-only artifact.

## Owned paths

- `design-specs/0057-control-room-agent-observation-correlation.md`
- `plans/active/0057-control-room-agent-observation-correlation.md`
- `model/work/work.json`
- `model/work/features/0057-control-room-agent-observation-correlation.json`
- generated project-model views
- `src/agent-observation/**`
- `tests/agent-observation.test.ts`
- `examples/agent-observation/**`
- `apps/control-room/src/AgentObservations.tsx`
- `apps/control-room/src/App.tsx`
- `apps/control-room/src/App.vitest.tsx`
- `apps/control-room/src/test/fixture.ts`
- `scripts/accept/0057-control-room-agent-observation-correlation.ts`

`AGENTS.md` and all unrelated dirty work are forbidden.

## Execution slices

1. Freeze the exact envelope, error, artifact, and correlation vocabulary.
2. Build the Langfuse path through one public-interface red-green tracer.
3. Add the ClickStack adapter through the same interface.
4. Exercise complete, incomplete, truncated, orphaned, cyclic, over-bound, unknown-work, and revision-mismatch cases.
5. Add one pure Control Room projection with no command or status-transition output.
6. Run both fixture journeys and the exact acceptance command.

## Invariants

- Telemetry is observation, never work or evidence authority.
- Attempt identities remain `observed_only` until a canonical attempt registry exists.
- The same capture yields byte-identical report bytes. Row permutation preserves normalized trace and correlation while changing the source digest.
- A complete capture is a single validated tree. An incomplete capture is an inspectable forest with diagnostics.
- Correlation uses only the five frozen explicit attributes.
- Report bytes are deterministic under input row permutation.
- No network, credential, retry, queue, background process, vendor write, or portfolio write exists in this feature.

## Acceptance

```bash
nix develop -c bun scripts/accept/0057-control-room-agent-observation-correlation.ts
```

The acceptance program must print both source digests, declared bounds, capture states, unsupported claims, and checks that did not run.

## Evidence ledger

- 2026-08-02: the operator approved the draft direction. The frozen contract added exact digest custody, complete-tree rules, the Effect `Crypto` requirement, and `observed_only` attempt semantics before implementation.

## Assumptions and limits

Vendor exports and portfolio snapshots can lie about their origin. Digest verification establishes byte identity only. Parent links do not establish causal truth. Explicit PBK attributes do not establish caller authorization. Tests and runtime checks do not prove completeness, correctness, evidence sufficiency, or agent quality.
