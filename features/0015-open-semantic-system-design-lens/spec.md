---
format: semantic.feature-artifact/v1
feature_id: 0015-open-semantic-system-design-lens
kind: specification
legacy_entity_id: work.open-semantic-system-design-lens
---
# Design spec 0015: open semantic system design lens

Status: frozen for tracer implementation

Date: 2026-07-30

Migrates-Feature-IDs: 0005-autonomous-development-control-loop

Design-Lens-Version: open-semantic-system-v1

## Problem

Semantic Systems already says that components are recursive open systems,
effects are capability contracts, evidence is typed, and ownership is distinct
from observation and derivation. Those principles do not yet form one
mandatory design-time lens. An agent can therefore write a plausible design
spec while leaving the following meanings implicit:

- what state and invariants the declared system actually owns;
- whether an input is a command, observation, query, acknowledgement, or
  another semantic speech act;
- whether an output is a domain event, an artifact derived from maintained
  state, an effect request, or evidence returning from the environment;
- what an effect request establishes before any response is observed;
- which ambiguity, duplication, delay, retry, and reconciliation semantics
  belong to an open interaction protocol;
- how persistent state ownership, bounded task lifetime, supervision,
  communication, derivation, and deployment relate without being collapsed
  into one hierarchy; and
- which resource and progress bounds apply to one locally autonomous reaction.

The result is terminology drift and unsound claims such as `EmailSent` when
the system observed only request issuance, treating a projection as authored
state, treating timeout as non-execution, or drawing the supervision tree as
the communication graph.

This feature makes the lens concise, visible, reusable, and mechanically
required when an agent adds or changes a feature design contract. It does not
claim that a Markdown validator can prove the design is good.

## Felt journey

An agent engineer begins a new stateful feature. `AGENTS.md` points to one
short canonical design lens and the design-spec template. The agent names the
declared system boundary, warranted state, semantic inputs and outputs,
effect protocols, component structures, reaction bounds, evidence, and
unsupported claims before implementation is delegated.

The pull-request feature gate rejects a new or changed design spec when the
required lens marker or a required section is absent or placeholder-only. The
same gate accepts a completed lens without trying to infer semantic truth from
keywords. A reviewer can then challenge explicit statements and compare them
with executable oracles.

An agent working outside this repository can consume the same concise doctrine
through a future Reef scaffold and an Agent Skill. Those carriers must be
generated or conformance-checked against this canonical vocabulary rather than
forking its meanings.

## Open semantic system design lens

### Boundary and warranted state

The declared system is the repository's design-contract authoring and
shape-validation boundary. It owns the canonical worksheet vocabulary, the
template, and deterministic acceptance or rejection of observable Markdown
structure. It does not own a feature's domain state and does not warrant that
accepted prose is semantically correct.

### Semantic inputs

Inputs are an exact Git comparison range, the selected feature identity,
explicit migration identities, and the corresponding checked-in Markdown
bytes. Git change records are observations of repository history; CommonMark
syntax trees are parser observations of document structure. Neither establishes
the truth, completeness, or feasibility of authored claims.

### Semantic outputs

The canonical output is a typed feature selection or a diagnostic rejection.
The template, doctrine, and agent guidance are authored source artifacts.
Generated reports and future Reef or Skill carriers are derived projections and
must not redefine the vocabulary.

### Effect protocols and uncertainty

The checker reads repository files and invokes Git through bounded child
processes. Missing files, ambiguous markers, parser-visible structural drift,
and command failure reject explicitly. Rendered-visibility indeterminacy
explicitly excludes the affected subtree from eligible text instead of
approximating it. The checker performs no repair, retry, network publication,
or natural-language inference.
The parser/rendering path establishes only recognized Markdown structure and
static text eligibility under the bounded rendered-visibility model below; it
does not establish browser rendering, semantic truth, or worldly consequences.

### Components and orthogonal structures

Git range inventory, feature/migration selection,
`mdast-util-from-markdown` structural parsing, `micromark` rendering, `parse5`
tree parsing and visibility traversal, `css-tree` direct-inline cascade
evaluation, design-lens shape validation, acceptance dispatch, and independent
semantic review remain separate components. File bytes become syntax nodes and
then a static rendered-text observation within one representation pipeline; a
shape verdict changes evidential vocabulary and never becomes a
semantic-validity verdict. The finite validation slice terminates in selection
or rejection and contains no message cycle.

### Bounded autonomy and resources

One invocation observes a finite changed-path set and finite design documents,
launches bounded synchronous Git commands, parses each changed contract once,
and returns one result. Time, document size, process memory, and repository
integrity remain host assumptions; CI and the pinned environment own their
operational limits.

### Evidence, assumptions, and unsupported claims

Mutation tests, real-range replay, type/lint checks, exact acceptance, and
independent counterexample review retain distinct evidence categories. The
frozen gate makes these implementation assumptions explicit:

- Git reports the requested exact range and the checked-in bytes are the bytes
  observed by the validator.
- `mdast-util-from-markdown@2.0.2` supplies CommonMark/MDAST structure and
  source positions, including the authenticated code ranges and structural
  headings used by the shape check.
- `micromark@4.0.2` renders each complete selected section to HTML with
  dangerous HTML allowed; fenced and indented code ranges are blanked before
  this render, while raw visible HTML remains eligible.
- `parse5@8.0.1` parses that complete HTML fragment with WHATWG tree
  construction. The gate collects text nodes from this parsed tree, not from
  Markdown source or a repository-owned HTML-tag scanner.
- `css-tree@3.2.1` parses only direct inline declaration lists and evaluates
  the static cascade for `display` and `visibility`; it does not resolve
  stylesheets, selectors, inheritance, or browser state.

The direct-inline CSS observation is three-valued. `hidden` means a valid
effective declaration yields `display:none` or `visibility:hidden|collapse`.
`static-visible` means no effective hiding declaration remains after ordinary
invalid declarations are ignored; it makes text eligible under this gate, not
proof of browser visibility. `indeterminate` means the declaration list is
unparseable or contains grammar-invalid `Function`/`Raw` syntax; its subtree
cannot contribute acceptance prose. `var()`, `env()`, and `attr()` substitution
therefore remains unknown rather than being approximated.

The HTML traversal conservatively excludes comments and doctypes; `audio`,
`canvas`, `datalist`, `head`, `iframe`, `math`, `meter`, `noembed`, `noframes`,
`noscript`, `object`, `optgroup`, `option`, `progress`, `rp`, `script`,
`select`, `style`, `svg`, `template`, `title`, and `video` subtrees; the
`hidden` attribute; closed dialogs; and non-open popovers, with the
`dialog[open]` exception. A closed `details` contributes only its first
visible `summary`; supported audio/video fallback, SVG, MathML,
option/optgroup, progress/meter, and ruby `rp` fallback are intentionally
rejected rather than approximated.

This boundary does not guarantee browser or future-parser equivalence, layout
or paint, accessibility or replaced-widget semantics, external or inherited
CSS, classes/selectors, dynamic DOM state, animations, media/viewport effects,
or visual properties beyond direct inline `display`/`visibility`. The shape
verdict also does not establish semantic correctness, architectural
correctness, evidence sufficiency, placeholder-detection completeness,
reviewer independence, or domain/world-state guarantees. Chromium 150 and
Fable matrices are comparison observations, not proof of those guarantees.

## Canonical thesis

A program or component is an **open semantic system** relative to one declared
boundary:

```text
step : State × Input
    -> State × DomainEvent* × Artifact* × EffectRequest*
```

- `State` is the maintained epistemic model whose invariants the system owns.
  It is not the world.
- `Input` is a typed semantic message. Commands request a decision;
  observations report source evidence; queries request information;
  acknowledgements and effect outcomes remain observations until interpreted.
- `DomainEvent` states what the domain transition established according to the
  system's rules.
- `Artifact` is a value justified by and derived from maintained state, such as
  a response, plan, rendered tree, report, or materialized view.
- `EffectRequest` asks an environment or outer handler to attempt an
  interaction. The system can establish issuance, not the worldly consequence.
- A consequence becomes knowable only through a new observation with explicit
  provenance and evidential strength.

Effectfulness is boundary-relative. A handler expands the modeled system and
pushes the remaining open interaction outward. The environment cannot be
exhaustively modeled, but its interface, protocol, assumptions, and possible
responses can be.

## Required design lens

Every newly added or changed nontrivial feature design spec must contain
exactly one marker:

```text
Design-Lens-Version: open-semantic-system-v1
```

and exactly one `## Open semantic system design lens` section with these
non-empty level-three subsections:

### Boundary and warranted state

Declare the system or component boundary, the state and invariants it owns,
and what remains environmental. State whether the boundary is being treated as
opaque or expanded into an internal system.

### Semantic inputs

Inventory commands, observations, queries, acknowledgements, snapshots, and
other input families. For every observation, state its source, provenance, and
what it does not establish. Do not place all inputs into one global message
type when a smaller semantic scope exists.

### Semantic outputs

Separate domain events, artifacts/materialized views, effect requests, and
diagnostic observations. State which outputs are canonical and which are
derived projections. Producing an artifact and delivering or persisting it are
different operations.

### Effect protocols and uncertainty

Describe each open interaction as a protocol rather than a synchronous
function fiction. Include accepted, rejected, delayed, duplicated, timed-out,
unknown, and later-observed outcomes where relevant. State idempotency,
deduplication, retry, reconciliation, and cancellation semantics. `TimedOut`
means no response was observed before a deadline unless stronger evidence is
available.

### Components and orthogonal structures

Keep at least these structures distinct when they exist:

- state/authority ownership;
- supervision and recovery;
- communication topology;
- structured-task ownership;
- data derivation and invalidation;
- deployment placement; and
- cross-component atomic or coordination boundaries.

Explain composition behavior that local component correctness does not cover,
including deadlock, livelock, overload, ordering, and cross-component
invariants where relevant.

### Bounded autonomy and resources

Persistent components may have unbounded lifetimes, but each reaction and its
task tree must have a completion, cancellation, or explicit suspension
boundary. Declare mailbox, fan-out, retry, concurrency, payload, memory,
capability, or other semantic grades and policies that the claim depends on.
Keep environment-specific costs in realization evidence.

### Evidence, assumptions, and unsupported claims

State which observations, tests, static analyses, model checks, proofs,
benchmarks, assertions, and assumptions support each important claim. Do not
upgrade one evidence category into another. Record progress, delivery,
world-state, and environmental guarantees that remain unsupported.

## Surfacing architecture

The doctrine is exposed through five layers with one meaning:

1. `AGENTS.md` contains the compact non-negotiable reminder and directs design
   work to the canonical lens.
2. `docs/open-semantic-system-design.md` explains the vocabulary, examples,
   anti-patterns, and reviewer questions.
3. `design-specs/TEMPLATE.md` makes the lens the default authoring path.
4. `scripts/check-feature-contract.ts` rejects any selected design spec changed
   in the PR range when the marker or required non-placeholder sections are
   absent. It checks presence and shape only.
5. `scripts/accept/0015-open-semantic-system-design-lens.ts` and focused tests
   prove the gate distinguishes a complete lens from missing, duplicate, and
   placeholder lenses.

A later reusable Agent Skill must stay concise and point agents to typed
interfaces and references. Reef may install the template and gate into new
repositories. Workgraph may derive multiple structural views. Oxlint rules may
enforce code-level boundaries only where syntax or type information can
establish them; pure text matching must not claim semantic understanding.

## Gate semantics

The design-lens gate attaches to a changed design contract, not every Markdown
file:

- if the selected feature design spec is added or its bytes change in the PR
  range, validate the marker and section shape;
- if the selected legacy design spec is unchanged, do not retroactively fail
  its acceptance solely for lacking the new marker;
- if a migrated secondary design spec changes, validate it too;
- reject duplicate markers, duplicate required headings, absent headings, and
  headings whose visible content is empty or only comments/code fences;
- do not search implementation prose for preferred words;
- do not report semantic validity, architectural correctness, or evidence
  sufficiency from this static check.

This migrates feature 0005's PR contract gate. The frozen control-loop spec
must record the new shape-only design-contract observation without changing
merge authority or evidence meanings.

## Oracle-first counterexamples

Retain executable rejection cases for:

1. a new design spec with no lens marker;
2. a marker with the wrong version;
3. duplicate markers;
4. a missing required subsection;
5. a duplicate required subsection;
6. a subsection containing only comments or code fences;
7. a changed migrated secondary design spec without the lens;
8. an unchanged legacy design spec being rejected retroactively;
9. a complete lens being rejected because it uses domain-specific prose rather
   than preferred keywords; and
10. the validator claiming semantic correctness instead of shape conformance.

## Acceptance

`bun scripts/accept/0015-open-semantic-system-design-lens.ts` must establish:

1. the constitution and canonical design-lens document agree on the open-system
   thesis, epistemic state, artifact/effect distinction, boundary relativity,
   and returned observations;
2. `AGENTS.md` makes the lens visible before a design spec is frozen;
3. the template contains the exact version marker and all required sections;
4. the feature-contract gate validates every changed selected or migrated
   design spec and preserves unchanged legacy contracts;
5. all ten oracle-first cases are represented by focused tests;
6. the gate reports only static contract-shape evidence;
7. the 0005 migration is explicit and its existing feature-loop tests remain
   green;
8. formatting, lint, typecheck, project-model validation, generated-view drift,
   and the repository integration suite remain green; and
9. the skill/legacy portability opportunity is recorded without fabricating
   an installed skill or completed Reef integration.

## Kill or redesign criteria

Stop or redesign if:

- the only enforceable result is a long prose checklist agents routinely skip;
- the validator needs natural-language semantic inference to pass;
- every small local/UI feature must model irrelevant distributed-system
  machinery;
- the lens forces supervision, actors, CQRS, event sourcing, or one global
  message bus where the problem does not require them;
- artifact construction and external delivery cannot be represented
  separately; or
- the gate retroactively invalidates unchanged accepted feature contracts.

## Non-goals

- proving architecture correctness from Markdown;
- requiring actors, CQRS, event sourcing, OTP, or STM;
- replacing domain-specific design judgment;
- building the general Workgraph multi-view renderer;
- shipping the cross-repository Reef scaffold in this feature;
- implementing a generic Agent Skill installer;
- adding speculative text-only Oxlint rules; and
- changing language, theory identity, evidence-category, or merge-authority
  semantics.

## Provenance posture

The operator supplied the design synthesis in the shared conversation
`https://chatgpt.com/share/6a6ba681-ee04-83eb-b4b9-9acdb406683c`.
It is design input, not semantic authority or independently checked evidence.
The implementation evaluates and cites primary prior art where useful, copies
no conversation prose as an external authority, and keeps the repository's
constitution authoritative.

## Semantic diff

Revision 1, 2026-07-30: The correction after rejected head `077e70a` makes
this owning contract itself conform to the worksheet it introduces and
replaces repository-owned Markdown block recognition with an attributed
CommonMark parser. It changes no domain, evidence-category, or merge-authority
semantics.

Revision 2, 2026-08-02: The rendered-visibility correction records the
delivered evidence boundary in this owning contract. The gate's existing path
remains `mdast-util-from-markdown@2.0.2` for Markdown structure,
`micromark@4.0.2` for complete-section HTML rendering, `parse5@8.0.1` for
WHATWG fragment parsing, and `css-tree@3.2.1` for direct-inline
`display`/`visibility` cascade classification. Its three-valued CSS outcome
treats grammar-invalid function/raw syntax and unparseable styles as
indeterminate and excludes their subtrees from acceptance prose. Conservative
SVG/MathML, option/optgroup, progress/meter/rp, audio/video fallback,
closed-details, and non-open-popover exclusions remain explicit. This
documentation correction changes no gate behavior, domain, evidence-category,
or merge-authority semantics.
