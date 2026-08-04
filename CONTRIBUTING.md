# Contributing

## Canonical feature dossiers

Author lifecycle state in one stable directory:

```text
features/<feature-id>/
├── proposal.md
├── research.md? or research/
├── design.md?
├── spec.md
├── plan.md
├── implementation-report.md
├── accept.ts
├── verification/
└── transitions/
```

Markdown artifacts use strict `semantic.feature-artifact/v1` frontmatter. Do not
add lifecycle status fields or maintain a second model record. Generated views,
including `generated/project-model/work-features.json`, are projections; never
edit them by hand.

## Four command families

Run commands inside the pinned environment (`nix develop`). A missing required
tool fails the command; it is never downgraded to a warning.

| Command | Mode | Effect |
| --- | --- | --- |
| `just setup` | mutate | Install pinned dependencies, configure checked hooks, and write an ignored setup receipt. |
| `just check` | repair | Apply only Oxfmt writes, Oxlint safe fixes, and deterministic generated-view regeneration, then validate. |
| `just verify` | observe | Require a clean tracked tree at the exact base and head, and run checks without writing. |
| `just start <feature-id>` | mutate | Bounded, idempotent branch/worktree/lease creation after dossier contract checks. |

`just check` reports every changed path and fails if a repair changes an
undeclared path or is not stable by its second bounded attempt. It never stages,
commits, accepts snapshots, changes dependencies, or performs provider effects.
`just verify` never repairs a dirty tree. Local receipts are evidence of the
command run, not merge authority.

Hooks and CI use observe-only checks. They do not invoke `just check` or any
repairing fixer. Protected CI and merge authority remain external observations.

## Repository hygiene

Keep commits focused and preserve the exact head used for verification. Commit
messages and pull-request titles follow Conventional Commits, checked against
`commitlint.config.ts`. `bun run check-commit-policy` detects drift in the
versioned hook and commit-policy provenance.

Local hooks are bypassable (`git commit --no-verify` still works). Treat hook
output as early feedback, not lifecycle authority. Do not claim that a review,
merge, provider action, or cleanup occurred without a corresponding observation.

## Quality evidence

Use the command family that matches the desired effect. For a delivery claim,
record the exact `just verify` revision-bound receipt. For a local repair claim,
record the `just check` receipt and changed paths. Tests, analysis, assertions,
assumptions, and runtime checks remain distinct evidence categories.
