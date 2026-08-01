# Contributing

## Change the source, not generated views

Edit files under `model/`, then run:

```bash
semproj validate
semproj generate
```

Commit model and generated-view changes together.

## The development control loop

Design spec 0005 defines three nested gates. Each is executable in the pinned
Nix environment (`nix develop`); a missing required tool fails the gate, it is
never a warning.

Install the exact locked JavaScript tools once after entering the shell:

```bash
bun install --frozen-lockfile --ignore-scripts
bun run effect:setup
bun run hooks:install
```

The frozen install disables all package lifecycle scripts. The explicit,
idempotent Effect TSGO setup attaches Effect diagnostics to the pinned native
TypeScript 7 compiler and the checked hook installer sets
`core.hooksPath=.githooks`; local hooks improve feedback latency but remain
advisory and bypassable.

| Loop        | Command                   | Latency      | Covers                                                                      |
| ----------- | ------------------------- | ------------ | --------------------------------------------------------------------------- |
| Fast        | `just fast`               | seconds      | format, lint, typecheck, model validate/generate, commit-policy conformance |
| Integration | `just check`              | minutes      | frozen install + fast loop + the complete `bun test` corpus                 |
| Feature     | `just accept <id>-<slug>` | tracer-sized | the exact Bun acceptance program for one frozen design spec                 |

`nix flake check` runs the hermetic repository-source invariants and the
network-free commit-policy conformance script as real sandboxed derivations,
not merely a devShell evaluation.

Every commit message and pull-request title follows Conventional Commits,
checked against `commitlint.config.ts`. Allowed types are the standard
`config-conventional` set plus this project's `research`, `design`,
`governance`, and `plans` types. The hook scaffolding
(`.githooks/commit-msg`, `.githooks/pre-commit`, `commitlint.config.ts`,
`scripts/install-git-hooks.ts`) is materialized from Clamor's versioned
`ConventionalCommits` block; `config/clamor-blocks/conventional-commits.provenance.json`
records the upstream commit, block version and digest, and this project's
configured inputs. `bun run check-commit-policy` (also run by both loops)
detects drift between that provenance record and the checked-in artifacts.

Local hooks are bypassable (`git commit --no-verify` still works): pre-commit
runs staged-file checks plus the fast loop, while pre-push runs the pinned Nix
integration loop. CI checks tracked artifacts remain unchanged; dependency and
test caches are noncanonical ignored state. CI becomes authoritative only when
external branch protection requires the stable check names and merge queue
requires the prospective-tree result. Repository settings must also permit only
a Conventional-Commit-preserving merge strategy (normally squash); that
external prerequisite is not claimed active by this checkout.

A nontrivial feature owns one numeric ID shared by
`design-specs/<id>-<slug>.md`, `plans/active/<id>-<slug>.md`,
`scripts/accept/<id>-<slug>.ts`, one feature branch, and one pull request.
Trivial formatting, typo, generated-refresh, and mechanically equivalent
maintenance may skip the feature loop but must still pass the fast and
integration loops.

See `AGENTS.md` and `design-specs/0005-autonomous-development-control-loop.md`
for the full contract, including autonomous merge authority and completion
feedback. The checked-in sensors cannot determine that independent findings
were resolved or a finished Herdr tab/worktree was safely harvested; the main
integration agent verifies those external gates against the committed artifact.

## Quality gates

```bash
bun test
bun run semproj -- validate
bun run semproj -- generate --check
bun run semrefs -- catalog-check
bun run format:check
bun run lint
bun run typecheck
bun run check-commit-policy
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
