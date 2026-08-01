# Active plan 0039: kernel runner CLI

Canonical frozen contract:
[`design-specs/0039-kernel-runner-cli.md`](../../design-specs/0039-kernel-runner-cli.md).
This execution record cannot redefine that contract.

Status: implemented on candidate; exact-head review pending

Owner: primary Semantic Systems language lead

## Dependencies

- frozen agent-facing kernel JSON 0020;
- accepted reference interpreter 0022; and
- merged main `9af7bb0e79ec4632298d4dddf473db852ed39fbf`.

## Owned paths

- this design spec, plan, work item, and exact acceptance script;
- `src/kernel-cli/**`;
- `tests/kernel-runner-cli*.test.ts`;
- narrow `package.json` command additions; and
- derived generated project-model views.

Forbidden: changing kernel representation, checking, evaluation, observation
formats, bounds, bytecode code, surface language, deployment, operator-owned
`AGENTS.md`, or adding committed Python/shell programs.

## Implementation posture

- Reuse `interpretKernelJsonBytes` and
  `encodeCanonicalKernelRunObservation`; derive no parser, checker, evaluator,
  encoder, or wire format.
- Keep host I/O behind one narrow injected Effect capability.
- Read once, interpret once, encode once, and write once.
- Use the same core CLI program under Bun and genuine Node.
- Add no dependency and copy no upstream source.

## Execution sequence

1. Commit the frozen contract, plan, model item, and red acceptance.
2. Implement the injected host capability and stateless core command.
3. Add Bun and Node entry points plus the package commands.
4. Add custody, rejection, exit-code, architectural, and cross-runtime tests.
5. Run focused gates and exact acceptance on a clean head.
6. Commission independent exact-head review, correct findings, and integrate.

## Acceptance command

```bash
just accept 0039-kernel-runner-cli
```

## Evidence ledger

- 2026-08-01: capability audit found accepted bytes-only interpreter and
  canonical observation encoder seams, but no runnable kernel command.
- 2026-08-01: direct checker, parser, surface replay, and bytecode work were
  rejected as redundant or outside this interpreter-first slice.
- 2026-08-01: no external scaffold is needed; established repository CLI
  entry-point and platform-layer patterns are sufficient.
- 2026-08-01: pre-implementation review removed an impossible atomic-output
  claim. Usage and input-read failures precede stdout; a host output failure may
  have accepted a non-semantic prefix and remains an explicit exit-2 condition.
- 2026-08-01: the command now reads one bounded file/stdin prefix through an
  injected Effect capability, invokes only the reference interpreter, emits the
  existing canonical observation, and shares one core under Bun and Node.
- 2026-08-01: working-tree acceptance passed 11 focused Bun journeys, 3 genuine
  Node cross-runtime journeys, 55 inherited kernel journeys, the complete
  826-pass repository suite with one intentional oracle skip, 19,982
  assertions, and 68 Python parity checks. Exact clean-head replay remains
  mandatory before review.
- 2026-08-01: Fable 5 high rejected exact head `5ff3c06`: Node emitted an
  uncaught stream-error trace and exit 1 when the output consumer closed, while
  Bun correctly returned the typed exit-2 diagnostic. The stream adapter now
  observes both callback and emitted errors through one settling promise, and a
  genuine Bun/Node process journey pins the corrected behavior. The spec also
  clarifies that over-limit stdin is cut at one excess byte and rejected by the
  representation authority rather than classified as host I/O failure.
