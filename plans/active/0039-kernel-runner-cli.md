# Active plan 0039: kernel runner CLI

Canonical frozen contract:
[`design-specs/0039-kernel-runner-cli.md`](../../design-specs/0039-kernel-runner-cli.md).
This execution record cannot redefine that contract.

Status: contract frozen; implementation pending

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
