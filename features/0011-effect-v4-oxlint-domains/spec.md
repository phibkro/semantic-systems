---
format: semantic.feature-artifact/v1
feature_id: 0011-effect-v4-oxlint-domains
kind: specification
---
# Design spec 0011: reusable Effect v4 Oxlint domains

Status: frozen

Problem owner: operator and main integration agent

Semantic frontier: reusable static architecture policy for Effect v4 programs

## User journey

A TypeScript project installs one compiled Oxlint JavaScript plugin and selects
the domains that describe each source region: Effect v4, architectural role,
runtime platform, and semantic boundary. The resulting diagnostics prevent
ambient authority, accidental runtime coupling, premature Effect execution,
untyped external decoding, and unstructured operational output without
requiring the consumer to copy Semantic Systems paths or configuration.

The same rule package serves a portable stateless library, a stateful service,
and Node, Bun, Deno, browser, or worker applications by composing explicit
domains. A consumer can inspect which rule and domain produced every
diagnostic, override severity deliberately, and suppress one developer-only
observation with a targeted reason.

## Falsifiable claim

The package is reusable exactly when:

1. its published entrypoint is compiled ESM JavaScript with declarations and
   loads through Oxlint without a TypeScript runtime loader;
2. no rule contains Semantic Systems directory names or assumes one repository
   layout;
3. independently selectable domain profiles distinguish Effect technology,
   architectural role, runtime platform, and semantic boundary;
4. portable code rejects Node, Bun, Deno, browser, and worker ambient
   capabilities, while a selected platform adapter admits only its declared
   platform surface;
5. libraries may describe Effect programs but cannot execute them, while
   composition roots may provide final layers and run programs;
6. external data is decoded through an explicit typed boundary and operational
   output uses Effect logging, `Console`, or an injected service;
7. rules that need TypeScript types remain delegated to `@effect/tsgo`, with
   overlap and required companion diagnostics documented; and
8. the package's rule, domain, runtime, and suppression matrix passes under
   every declared compatible Effect v4, Oxlint, Bun, and Node version.

The claim is falsified by a path-sensitive rule, a profile that silently admits
another platform, a stateless-library profile that executes Effects, an AST
rule presented as type-aware, an unreasoned broad suppression, or a package
that works only when Oxlint executes repository-local TypeScript.

## Domain vocabulary

Domains are orthogonal selections, not one flat mutually exclusive enum.
Configuration expands their intersections into ordinary Oxlint rules and file
overrides.

### Technology

- `effect-v4` — source that imports or implements Effect v4 programs, services,
  layers, schemas, or platform integrations.

Technology detection may suggest a domain from declared dependencies, but
explicit configuration remains authoritative. Import detection alone cannot
prove that an indirectly wrapped module is or is not Effect-bearing.

### Architectural role

- `pure-library` — total deterministic values and functions; no Effect
  execution or ambient capability;
- `effect-library` — may describe Effects, services, schemas, and layers but
  cannot execute a runtime or bind a concrete platform;
- `service` — stateful or capability-bearing implementation behind declared
  Effect services;
- `application` — application orchestration that remains platform-portable;
- `composition-root` — the narrow boundary that selects live layers, provides
  the final environment, and runs the program;
- `runtime-adapter` — the narrow implementation of one declared platform
  capability or live layer;
- `test` — controlled execution and replacement services for deterministic
  examples and tests.

`pure-library` is stricter than `effect-library`; `service` does not imply a
concrete runtime; and `application` does not imply permission to call
`Effect.run*`.

### Runtime platform

- `portable`;
- `node`;
- `bun`;
- `deno`;
- `browser`;
- `web-worker`.

`portable` conflicts with every concrete runtime domain. Concrete domains
admit only their own declared built-ins, globals, and Effect platform layers;
they continue to reject another runtime's surface. Node compatibility exposed
by Bun or Deno is not silently treated as portable and must be declared
explicitly at the adapter boundary.

Additional runtimes such as Cloudflare Workers may be added only with an
independently tested capability inventory instead of being inferred from
browser similarity.

### Semantic boundary

- `external-data` — JSON, TOML, environment, command-line, network, or
  persistence input requiring explicit decoding;
- `observability` — logs, console output, tracing, metrics, and telemetry;
- `security-sensitive` — cryptographic randomness, secrets, credentials, and
  authorization observations;
- `persistence` — durable state, atomic publication, and storage errors.

Boundary domains enable focused rules; they do not relabel runtime validation,
tests, or static analysis as proof.

## Initial rule families

The first package generalizes the six tested Semantic Systems rules without
copying their path classifier:

1. **Observability capability** — reject ambient `console` in Effect-bearing
   operational code. Direct output uses `Effect.log*`, Effect `Console`, or an
   injected service. Genuinely developer-only output may use one targeted
   suppression containing a `dev only:` reason. The rule remains severe by
   default.
2. **Ambient capability** — reject ambient clock, random, cryptographic,
   network, timer, environment, filesystem, process, and runtime authority
   where an Effect service or injected capability owns the operation.
   Deterministic constructors such as `new Date(capturedMilliseconds)` remain
   distinct from ambient observation such as `new Date()` or `Date.now()`.
3. **Platform portability** — reject cross-runtime imports and globals
   according to the selected runtime domain; allow official platform live
   layers only in the matching composition-root or runtime-adapter role.
4. **Effect execution topology** — reject `Effect.run*` outside a composition
   root and reject final provision that prematurely closes a reusable library's
   requirements. Layer construction and internal service composition are not
   confused with final runtime execution.
5. **External decoding** — reject raw JSON parsing at declared external-data
   boundaries in favor of Effect Schema decoding. Other formats require their
   own explicit parser/Schema seam rather than a false claim that Schema alone
   parses every syntax.
6. **Typed failure/totality** — reject throws only in roles whose contract is
   total or whose failures must remain in an Effect error channel. It is not a
   blanket JavaScript-wide `throw` ban.

Each rule exposes options for domain-sensitive identifiers and admitted
composition roots. Presets supply conservative defaults; consumers do not need
to fork rule source.

## Type-aware companion boundary

Oxlint JavaScript plugins currently receive syntax, scope, code-path, and
project APIs but do not receive TypeScript type information. The package
therefore does not reimplement or claim equivalence to type-aware Effect
diagnostics.

The compatibility documentation maps package profiles to reviewed
`@effect/tsgo` diagnostics, including:

- floating Effects;
- leaking requirements;
- strict provision;
- unsafe Effect type assertions;
- unknown values in error contexts;
- outdated Effect APIs;
- ambient console, clock, fetch, random, timer, process-environment, and
  cryptographic UUID use inside Effects; and
- Schema preference at typed external boundaries.

Where a syntax rule overlaps a TSGO diagnostic, the preset states which one is
authoritative and prevents duplicate noise. TSGO installation and compiler
patching remain outside the Oxlint plugin's runtime.

## Package and configuration contract

- The package is explicitly third-party and does not imply Effect project
  endorsement.
- The initial release line is `0.x` while Effect v4 and Oxlint JavaScript
  plugins remain pre-stable.
- `effect`, `effect-oxlint`, Oxlint, and supported host runtimes have an exact
  reviewed compatibility matrix. Dependency ranges never silently admit a new
  Effect beta.
- The default export is an ESLint-v9-compatible Oxlint JavaScript plugin.
- Named exports include individual rules, `recommended` and `strict` presets,
  domain metadata, and a typed configuration builder that expands domain
  intersections into Oxlint overrides.
- The distributed runtime contains compiled ESM JavaScript, declarations,
  source maps, rule documentation, and license/provenance metadata.
- The package has no dependency on Semantic Systems sources, generated files,
  project model, or repository paths.
- All rules are individually selectable. Presets may choose severity but cannot
  prevent a consumer from making an explicit local override.

## Oracle first

Before extraction, fixtures must demonstrate the current repository-local
plugin cannot classify an arbitrary consumer layout. The implementation then
passes a matrix containing:

- the six architectural roles under `portable`;
- Node, Bun, and Deno adapters with positive own-runtime and negative
  cross-runtime imports/globals;
- browser and worker global differences;
- an Effect library that describes but never runs an Effect;
- an application that composes services but leaves final provision open;
- one composition root per supported platform;
- raw and Schema-decoded external JSON;
- ambient and injected clock/random/crypto/network/console capabilities;
- deterministic `new Date(value)` versus ambient current time;
- local shadowing of names such as `console`, `process`, and `crypto`;
- developer-only targeted suppression with a reason, broad suppression
  rejection where enforceable, and unused-disable reporting;
- equivalent execution from `.oxlintrc.json` and `oxlint.config.ts`; and
- loading the packed compiled artifact from a temporary consumer project with
  no source TypeScript loader.

At least one oracle must be observed red for each new rule family or domain
intersection before its implementation is accepted.

## Acceptance

The future completion gate must:

1. build and pack the standalone artifact;
2. install that tarball into isolated Node, Bun, and Deno-oriented consumer
   fixtures without running lifecycle scripts;
3. run Oxlint against every domain intersection and negative control;
4. run TypeScript and Effect-specific tests against the exact compatibility
   matrix;
5. prove the Semantic Systems configuration consumes the package rather than a
   copied local implementation;
6. prove no distributed file contains Semantic Systems path knowledge; and
7. run repository typecheck, lint, formatting, tests, and diff hygiene.

## Non-goals and limits

This feature does not claim to enforce all idiomatic Effect v4, replace TSGO,
prove effect safety, infer architecture perfectly, make Deno equivalent to
Node, or guarantee that an allowed platform API is operationally safe. It does
not add a Biome plugin; Biome's domain model is design prior art for
configuration semantics.

Automatic fixes are absent unless they are locally semantics-preserving. In
particular, replacing an ambient operation with an Effect service changes
requirements and composition and is not a safe syntax-only fix.

## Reuse and provenance

- Reuse the six independently tested local rules and their counterexamples
  after removing repository path policy.
- Build on `effect-oxlint` and Effect v4 under their compatible licenses.
- Follow Oxlint's documented ESLint-v9 JavaScript-plugin surface and compiled
  npm-package loading.
- Adapt Biome's explicit technology/project/test domain idea as configuration
  prior art; do not copy its implementation or present the vocabulary as
  Biome-native behavior.
- Retain the reviewed lessons from `joelhooks/effectts-skills` only where
  independently corroborated against the pinned Effect release; that
  repository remains advisory prior art, not semantic authority.

## Semantic diff

This feature turns repository-local architectural diagnostics into a reusable,
explicitly scoped policy package. It adds no application runtime behavior,
semantic theory, evidence category, trust claim, or proof.
