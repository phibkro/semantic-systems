# Semantic Systems Control Room

The Control Room is a read-only PWA over the versioned public snapshot. It never
loads canonical model files, credentials, repository workflow context, or a
mutation API.

## Local phone preview

From the repository root, enter the pinned environment and build from the exact
checked-out commit:

```bash
nix develop
bun install --frozen-lockfile
sh scripts/export-public-model.sh
CONTROL_ROOM_BASE=/semantic-systems/ bun run --cwd apps/control-room build
bun run --cwd apps/control-room serve:preview
```

Open <http://127.0.0.1:4173/semantic-systems/>. Chrome or Chromium can install
the app from that secure local origin. The export command refuses a dirty tree
or a commit other than exact `HEAD`, and the resulting UI is visibly marked
`Local preview`. `CONTROL_ROOM_OBSERVED_AT` is available only for reproducible
fixture observations. The protected Pages workflow is the only supported path
that emits a `main_ci_assertion` observation. That field records a publisher
assertion, not authenticated provenance or proof that the commit was accepted;
the Pages deployment and GitHub Actions run are separate runtime observations.

## Acceptance

On a clean committed tree inside `nix develop`:

```bash
./scripts/accept/0006-control-room-pwa.sh
```

The script validates the canonical model and generated-view equality, checks
the deterministic exporter, runs Oxfmt/Oxlint/TypeScript 7/Vitest, builds at the
GitHub Pages base path, scans the final payload, and runs mobile Playwright
service-worker and offline acceptance.

The public default URL will be
`https://phibkro.github.io/semantic-systems/` after the Pages workflow is
enabled and succeeds on accepted `main`. That external deployment has not been
performed by the local implementation. `https://semantic.phibkro.org/` remains
a separate DNS, Pages, and HTTPS blocker until the default URL is verified.
