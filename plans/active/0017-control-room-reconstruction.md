# Active plan 0017: Control Room reconstruction

Canonical frozen contract:
[`design-specs/0017-control-room-reconstruction.md`](../../design-specs/0017-control-room-reconstruction.md).
This mutable execution record cannot redefine that contract.

Status: contract frozen; intentionally red acceptance awaits isolated
implementation

Owner: primary Semantic Systems lead

## Dependencies

- accepted current primary `04579fdb40ca4169d1d9e861eb7c94472d772e59`;
- accepted executable semantic-system integration and current TypeScript/Effect
  v4 project model;
- historical accepted Control Room PWA lineage
  `f3250485ebf293ee270b262abad726ecc720c937`;
- historical reviewed Alchemy correction head
  `2301780c6a4a24b1fa707ee5e893ebf96d1b814b`; and
- operator choice of Alchemy v2 over Pulumi.

No provider mutation is authorized by this plan.

## Owned paths

- `design-specs/0017-control-room-reconstruction.md`
- `plans/active/0017-control-room-reconstruction.md`
- `scripts/accept/0017-control-room-reconstruction.ts`
- `model/work/control-room-reconstruction.json`
- generated projections derived from that model file
- `src/project-model/public-export.ts`
- focused public-export tests under `tests/`
- `apps/control-room/**`
- `.github/workflows/control-room-alchemy.yml`
- bounded root package, lockfile, TypeScript, Nix, lint, and Just changes
  required to compose the app

Forbidden paths and meanings include changing canonical theory/resolution,
inventory, actor, STM, semantic-system, evidence-strength, or scheduler
semantics; restoring Python or shell programs; editing generated views by hand;
copying the old branch wholesale; adopting the Cloudflare zone; provider
apply/destroy; writing GitHub secrets; and unrelated repository cleanup.

## Implementation posture

- Search current project-model, Effect v4, command-runner, lint, workspace, and
  Just patterns before writing infrastructure.
- Use Git archaeology as the scaffold: selectively reconstruct accepted UI and
  deployment behaviors from the three commit-bound historical sources named by
  the contract.
- Record every reused file family and material semantic adaptation. The
  historical source is this same repository; no external code may silently
  define project semantics.
- Replace the Python exporter with one TypeScript/Effect public-export module
  over the current decoded project model. Do not transliterate obsolete
  implementation structure.
- Reuse exact `alchemy@2.0.0-beta.64` behavior initially. Keep Alchemy
  description, operator administration, and workflow event routing separate.
- Add only the shadcn source components actually used by the accepted journey.
- Automate deterministic build/export/payload checks; stop before provider
  deployment, generic scaffolding, a live control plane, or UI redesign.

## Execution sequence

1. Freeze this reconstruction contract, plan, canonical work item, and
   intentionally red TypeScript acceptance.
2. Reconstruct public-schema oracles against the current project-model
   boundary.
3. Implement the minimal TypeScript/Effect allowlist exporter.
4. Selectively reconstruct the PWA shell, five views, freshness/update state,
   and browser oracles.
5. Reconstruct pure deployment identities, Alchemy memo/stack, and static
   workflow safety checks without provider mutation.
6. Run exact local acceptance and full repository integration at a clean head.
7. Commission independent adversarial review and correct rejected heads.
8. Integrate the exact accepted candidate and record user-interactive local
   preview instructions.
9. With separate operator authority, inspect the exact Alchemy plan and decide
   whether to provision CI, preview, cleanup, production, and cutover.

## Acceptance command

```bash
bun scripts/accept/0017-control-room-reconstruction.ts
```

The gate fails closed on missing tools, artifacts, Chromium, public-payload
inspection, current model validation, inherited semantic acceptance, or any
attempt to substitute deployment claims for observations.

## Evidence ledger

- 2026-07-31: repository archaeology established that direct merge is unsafe:
  current primary is more than one hundred commits ahead of the common
  `e00e8f9` base, while the Alchemy branch carries ten old-lineage commits and
  Python/shell project-model programs.
- 2026-07-31: selected reconstruction rather than merge. Evaluated the
  accepted PWA, accepted Pages observation repair, and reviewed Alchemy branch
  as same-repository prior art. Their product behavior, oracles, workflow
  counterexamples, deployment parser, and memo-scope fix are reusable; their
  runtime versions, Python exporter, shell wrappers, old generated views, and
  governance are rejected.
- 2026-07-31: chose exact-pinned Alchemy v2 over Pulumi because the reviewed
  stack is Bun/TypeScript/Effect-native, expresses Vite Worker websites and
  per-stage remote state directly, and already has adversarial stage,
  credentials, cleanup, memo, and zone-ownership evidence. The beta and
  provider plan remain explicit assumptions.
- 2026-07-31: no upstream snippet has been copied and no provider operation has
  run. The frozen acceptance is intentionally red until the isolated
  implementation creates the required application and exporter artifacts.
