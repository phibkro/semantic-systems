# Active plan 0015: open semantic system design lens

Canonical frozen contract:
[`design-specs/0015-open-semantic-system-design-lens.md`](../../design-specs/0015-open-semantic-system-design-lens.md).
This mutable execution record cannot redefine that contract.

Status: eleventh independent-review counterexamples corrected; exact-head
acceptance and full integration pass; clean-head custody and re-review pending

Owner: primary Semantic Systems lead

## Discovery evidence

- The operator-supplied conversation sharpens the existing constitution into
  one open-system design lens: epistemic state, typed speech acts, derived
  artifacts, open effect protocols, returned observations, bounded autonomy,
  and orthogonal system graphs.
- `docs/constitution.md`, `docs/stratified-design.md`,
  `docs/runtime-concurrency-spec.md`, and `docs/pattern-catalog.md` already
  contain compatible fragments, but no mandatory authoring worksheet.
- `AGENTS.md` is the always-read surface for repository agents.
- `scripts/check-feature-contract.ts` is the existing PR contract-shape
  authority. It already distinguishes changed feature identities and contract
  migrations, so extending that boundary is cheaper and clearer than creating
  an unrelated validator.
- No design-spec template or repository Agent Skill currently exists.
- The installed agent-browser exploration demonstrated that ambient browser
  focus is shared mutable state: another worker changed the active tab between
  two commands. The exact-tab batch succeeded. This is a concrete example of
  why ownership, process container, and session identity must remain distinct.

## Owned paths

- `design-specs/0015-open-semantic-system-design-lens.md`
- `plans/active/0015-open-semantic-system-design-lens.md`
- `scripts/accept/0015-open-semantic-system-design-lens.ts`
- `docs/open-semantic-system-design.md`
- `design-specs/TEMPLATE.md`
- compact additions to `AGENTS.md`, `docs/constitution.md`, and
  `docs/pattern-catalog.md`
- shape-only design-lens changes in `scripts/check-feature-contract.ts`
- focused gate tests in `tests/development-control-loop.test.ts` or a dedicated
  `tests/open-semantic-system-design-lens.test.ts`
- revision-only migration note in
  `design-specs/0005-autonomous-development-control-loop.md`

Forbidden paths and meanings include language semantics, theory normalization,
runtime actor/STM behavior, evidence category meanings, merge authority,
Workgraph implementation, Reef implementation, browser credentials/session
state, and unrelated project-model changes.

## Implementation posture

- Reuse the existing feature-contract parser, visible-content logic, and
  migration range semantics.
- Keep the static gate honest: validate required shape, never prose meaning.
- Prefer one exported pure validator with table-driven mutation tests.
- Keep always-loaded agent guidance short; detailed examples belong in the
  canonical document.
- Record primary prior art and the operator conversation as provenance without
  treating either as project authority.
- Defer cross-repository distribution to Reef and skill packaging rather than
  creating another uninstalled documentation island.

## Execution sequence

1. Freeze this contract, active plan, and intentionally red acceptance.
2. Add the canonical design-lens document, template, and concise AGENTS
   reminder.
3. Extend the feature-contract gate for changed selected/migrated specs.
4. Add mutation-oriented focused tests for all frozen counterexamples.
5. Record the bounded 0005 gate migration and pattern-catalog vocabulary.
6. Run exact acceptance and the full integration loop.
7. Commission independent semantic/governance review at the exact clean head.
8. Integrate only an accepted head, then record Reef/skill portability as a
   separate frontier.

## Evidence ledger

- 2026-07-30: complete shared conversation observed through one explicitly
  labeled, exact `agent-browser` tab-session `t19`; only that owned tab was
  closed after extraction.
- 2026-07-30: public web retrieval exposed only the title
  `CQRS and System Architectures`; rendered browser text supplied the actual
  design input.
- 2026-07-30: initial acceptance failed for the intended missing-doctrine
  reason before implementation.
- 2026-07-30: reused the feature-contract parser, exact PR-range change
  inventory, migration vocabulary, and visible-content strategy. The new
  validator remains a pure shape check and does not attempt natural-language
  semantic inference.
- 2026-07-30: reviewed Martin Fowler's CQRS account, the official Elm commands
  and subscriptions guide, current Erlang/OTP design principles and
  `gen_statem` documentation, and Plotkin/Pretnar's algebraic-handler work as
  prior art. No upstream code or prose was copied.
- 2026-07-30: exact acceptance passed: 6 dedicated lens tests/13 expectations,
  24 control-loop tests/250 expectations, typecheck, type-aware lint,
  formatting, project-model validation, and generated-view drift.
- 2026-07-30: operator refinement made semantic layers message-boundary
  claims, distinguished representation-preserving from semantic
  transformations, traced vertical slices to declared outcomes, and required
  explicit progress or persistence semantics for cycles. Exact acceptance
  passed with 7 dedicated lens tests/18 expectations and the same 24
  control-loop tests/250 expectations.
- 2026-07-30: full integration revalidation passed after that refinement:
  330 Bun tests/1,668 expectations, zero Effect diagnostics, and 68
  transitional Python custody checks. This is exact implementation evidence,
  not independent review.
- 2026-07-30: added the enforcement ladder, recursive FSM/actor/OTP/task-scope
  component model, CommonMark-length-aware fenced-block stripping, unclosed
  comment handling, and explicit placeholder rejection. Exact acceptance
  passed with 9 dedicated lens tests/33 expectations and 24 control-loop
  tests/250 expectations. Full integration passed with 332 Bun tests/1,683
  expectations, zero Effect diagnostics, and 68 transitional Python custody
  checks. Independent exact-head review remains pending.
- 2026-07-30: independent review rejected exact head `513bd85` because an
  unchanged template and obvious prose placeholders passed, `\s` let structural
  markers span lines, and the fence/comment scanner disagreed with CommonMark
  on fenced comments, backticks in info strings, indentation, and closing
  hashes. Ten falsifiers produced six false accepts and four false rejects.
- 2026-07-30: searched the established dependency graph for CommonMark,
  micromark, Remark, markdown-it, and Marked before editing; none is installed.
  Reused the existing pure validator and implemented only its bounded
  contract-shape grammar instead of introducing a renderer dependency.
  Template instructions are now HTML comments, markers are same-line tokens,
  structural sections use parsed line/heading records, fences authenticate
  before comments, and obvious placeholder tokens remain bounded rather than
  inferring prose meaning. The reviewer falsifiers and a higher-level section
  boundary are executable tests.
- 2026-07-30: corrected exact acceptance passed with 12 dedicated lens tests/43
  expectations and 24 control-loop tests/250 expectations, plus typecheck,
  type-aware lint, formatting, project-model validation, and generated-view
  equality. This remains implementation evidence pending a clean committed
  head and independent re-review. Full integration replay also passed with 335
  Bun tests/1,693 expectations, zero Effect diagnostics, and 68 transitional
  Python custody checks.
- 2026-07-30: independent re-review rejected exact clean head `077e70a`.
  Visible inline code containing literal `<!--` falsely entered comment state;
  a CommonMark fenced example nested in a list leaked its indented headings;
  and production range replay showed that selected 0015 plus migrated 0005 did
  not themselves contain structural lens instances. All ten counterexamples
  from the preceding rejection were independently confirmed fixed.
- 2026-07-30: the bounded repository-owned Markdown scanner reached its redesign
  criterion. Added exact `mdast-util-from-markdown@2.0.2` (MIT,
  `syntax-tree/mdast-util-from-markdown`) and now delegates CommonMark block and
  inline structure to its AST. Repository policy still requires exact top-level
  ATX headings, same-line markers, and bounded placeholder classification; it
  does not treat parser acceptance as semantic correctness.
- 2026-07-30: compared the parser choice against Bun's built-in Markdown API,
  TanStack Markdown, and Sätteri 0.9.5 rather than accepting mdast by default.
  Bun's API is unstable and exposes render callbacks without a source-positioned
  AST. TanStack documents deliberately incomplete CommonMark compatibility.
  An isolated Sätteri install correctly classified the inline-comment and
  list-contained-fence review falsifiers and exposed exact source ranges, but
  its pre-1.0 native/WASI distribution adds platform and trusted-tooling
  surface without a material benefit for this low-volume gate. The mature,
  pure-JavaScript mdast/micromark path remains the smallest portable fit;
  Sätteri remains a strong candidate for high-throughput rendering.
- 2026-07-30: revised frozen 0015 and migrated 0005 with explicit worksheet
  accounts and semantic-diff/invalidation records. A focused oracle now
  validates both real contracts, visible inline comment syntax, and
  list-contained fenced examples. Targeted evidence is 14 lens tests/47
  expectations plus green typecheck and type-aware lint. Exact acceptance
  passed with the unchanged 24 control-loop tests/250 expectations, model
  validation, and eight generated views. Full integration passed with 337 Bun
  tests/1,697 expectations, zero Effect diagnostics, and 68 transitional Python
  custody checks. Production range replay and independent review remain
  invalid until a new clean commit exists.
- 2026-07-30: third independent review rejected exact head `4167493`.
  Raw marker extraction still saw a marker hidden inside multiline inline code
  or an inline HTML comment, while visible prose inside CommonMark HTML blocks
  was incorrectly discarded. All earlier falsifiers, source-position cases,
  actual contracts, production range replay, dependency provenance, and the
  full 337-test integration suite passed independently.
- 2026-07-30: marker extraction now considers only direct MDAST text children,
  so inline code, comments, links, and other nested inline syntax cannot lend
  hidden source lines structural force. Added exact `parse5@8.0.1` (MIT,
  `inikulin/parse5`) to parse MDAST HTML fragments according to the WHATWG HTML
  model and collect actual text nodes while excluding comments and nonvisible
  script/style/template/title content. This avoids a repository-owned HTML tag
  scanner; Parse5 was preferred over a regex because quoted `>` characters and
  browser tree correction are relevant adversarial cases. Exact acceptance
  passed with 15 lens tests/53 expectations, the unchanged 24 control-loop
  tests/250 expectations, typecheck, type-aware lint, formatting, model
  validation, and eight generated views. Full integration passed with 338 Bun
  tests/1,703 expectations, zero Effect diagnostics, and 68 transitional Python
  custody checks. Production range replay, clean commit custody, and re-review
  remain pending.
- 2026-07-30: fourth independent review rejected exact head `913f88b`.
  Parsing each MDAST HTML token as an independent fragment lost the browser's
  context across inline sibling nodes. Template, script, self-closing raw-text,
  native-hidden, and fallback elements could therefore lend non-rendered text
  or a non-standalone marker structural force. The exact acceptance, full
  integration, Node/Bun parser parity, production range, source positions,
  pins, and licenses all passed independently; the failure was specifically
  the validator's rendered-visibility model.
- 2026-07-30: the fourth correction removes per-node HTML interpretation.
  MDAST still supplies top-level structural headings and authenticated code
  ranges; exact `micromark@4.0.2` (MIT, `micromark/micromark`) renders each
  complete section as one CommonMark fragment, and Parse5 parses that complete
  HTML fragment once. Fenced/indented code ranges are blanked before rendering
  while raw visible HTML remains eligible. Static HTML visibility excludes
  comments, raw/non-rendered and fallback containers, native `hidden`, closed
  dialogs, and direct `display:none`/hidden visibility declarations. The
  version marker is now one complete standalone top-level paragraph rather
  than a text-node substring. Exact acceptance passed with 15 focused tests/66
  expectations plus the unchanged 24 control-loop tests/250 expectations,
  typecheck, type-aware lint, formatting, model validation, and eight generated
  views. Full integration passed with 338 Bun tests/1,716 expectations, zero
  Effect diagnostics, and 68 transitional Python custody checks. Clean
  commit/range custody and re-review remain pending.
- 2026-07-31: fifth independent review rejected exact clean head `12383a9`.
  All preceding falsifiers and production gates passed, but the direct-style
  regex ignored declaration order and CSS comments: visible later declarations
  were falsely rejected while `display:/**/none` was falsely accepted. Closed
  `details` bodies and supported `audio`/`video` fallback text could also lend
  nonvisible prose to the shape gate. The reviewer observed 41 expected and six
  mismatched outcomes across a 47-case adversarial matrix.
- 2026-07-31: replaced the bounded style regex with exact
  `css-tree@3.2.1` plus `@types/css-tree@2.3.11` (MIT,
  `csstree/csstree` and DefinitelyTyped) declaration-list parsing. The static
  cascade now respects declaration order and `!important`, tokenizes comments,
  and decodes escaped CSS identifiers. Closed `details` contributes only its
  first visible `summary`; supported `audio` and `video` fallback children
  contribute no rendered prose. Focused evidence is 15 tests/79 expectations
  plus green typecheck, severe lint, formatting, and diff checks. Exact
  acceptance also passed with 24 control-loop tests/250 expectations,
  project-model validation, and eight generated views. Full integration passed
  with 338 Bun tests/1,729 expectations, zero Effect diagnostics, and 68
  transitional Python custody checks. This remains a direct-inline static
  visibility approximation: external stylesheets, classes, inherited CSS,
  dynamic DOM state, and broader visual properties are explicitly outside the
  gate's evidence.
- 2026-07-31: sixth independent review rejected exact head `8b09643`. All 47
  inherited cases passed, but three new direct-inline cases showed that a
  syntactically parsed yet property-invalid later declaration such as
  `display:bogus` incorrectly replaced an earlier valid hiding declaration.
  The exact production range and repository gates passed; the finding was a
  false accept inside the gate's declared direct-inline boundary.
- 2026-07-31: the cascade now consults CSS Tree's property grammar before a
  declaration can replace the prior effective value. Invalid property values
  are ignored according to cascade order; deferred `var()`, `env()`, and
  `attr()` substitution remains explicitly unknown rather than being
  fabricated as hidden or visible. Focused evidence is 15 tests/83
  expectations plus green typecheck, severe lint, formatting, and diff checks.
  Exact acceptance also passed with 24 control-loop tests/250 expectations,
  project-model validation, and eight generated views. Full integration passed
  with 338 Bun tests/1,733 expectations, zero Effect diagnostics, and 68
  transitional Python custody checks. Clean-head custody and re-review remain
  pending.
- 2026-07-31: seventh independent review rejected exact clean head `d9da673`.
  The property-invalid waiver recognized deferred substitution by searching
  serialized text, so quoted strings and URLs containing `var(`, `env(`, or
  `attr(` could incorrectly replace an earlier valid hiding declaration. All
  inherited matrices, exact acceptance, production-range replay, and full
  integration passed independently; the four quoted-token counterexamples
  failed.
- 2026-07-31: deferred substitution is now identified from CSS Tree `Function`
  nodes rather than text. Quoted spellings and URL content remain ordinary
  invalid values, while genuine `var()`, `env()`, and `attr()` functions retain
  their explicitly unknown static outcome. The focused suite passes with 15
  tests/87 expectations. Exact acceptance passed with the unchanged 24
  control-loop tests/250 expectations, typecheck, type-aware lint, formatting,
  model validation, and eight generated views. Full integration passed with
  338 Bun tests/1,737 expectations, zero Effect diagnostics, and 68
  transitional Python custody checks. Clean-head custody and re-review remain
  pending.
- 2026-07-31: eighth independent review rejected exact clean head `e0be50c`.
  Six malformed `var()`, `env()`, and `attr()` argument lists still received
  the property-grammar waiver. Chromium 150 discarded those later
  declarations and retained the earlier `display:none`; the gate instead
  counted their hidden prose as visible. All inherited matrices, production
  range replay, exact acceptance, and full integration passed independently,
  again identifying an incomplete oracle rather than a registered regression.
- 2026-07-31: the waiver now requires every arbitrary-substitution function in
  the declaration to satisfy its own argument grammar. CSS Tree validates
  custom-property names and the current `env()` grammar; the `attr()` syntax is
  supplied from the current CSS Values Level 5 grammar, including custom
  identifier units that CSS Tree's bundled attr-unit vocabulary does not yet
  admit. Focused positive and negative cases cover fallbacks, environment
  indices, units, empty arguments, malformed names/types, strings, URLs, and
  nested function discovery. The focused suite passes with 15 tests/103
  expectations. Exact acceptance passed with the unchanged 24 control-loop
  tests/250 expectations, typecheck, severe lint, formatting, model validation,
  and eight generated views. Full integration passed with 338 Bun tests/1,753
  expectations, zero Effect diagnostics, and 68 transitional Python custody
  checks. Clean-head custody and re-review remain pending.
- 2026-07-31: ninth independent review rejected exact clean head `e11423a`.
  A 73-case CSSWG/Chromium matrix found fourteen disagreements. CSS Tree emits
  some current `attr()` syntax and malformed nested substitutions as opaque
  `Raw` nodes, rejects valid empty fallbacks, and cannot reliably match escaped
  function spellings or current typed-attribute syntax. The implementation
  therefore could neither support its claimed current grammar nor validate
  every nested substitution.
- 2026-07-31: removed the repository-owned substitution grammar. The direct
  inline evidence boundary is now explicitly three-valued: CSS Tree
  property-grammar matches participate in the static cascade; ordinary invalid
  declarations are ignored; grammar-invalid function or raw syntax and
  unparseable inline style are indeterminate and cannot contribute acceptance
  prose. This intentionally rejects some browser-visible prose rather than
  pretending to know dynamic custom-property, environment, or attribute state.
  A local Chromium 150 comparison reproduced valid, invalid, escaped, nested,
  empty-fallback, indexed, unit, and typed-attribute cases used to set this
  boundary. Focused evidence passes with 15 tests/107 expectations, typecheck,
  formatting, and explicit indeterminate fixtures. Exact acceptance passed
  with the unchanged 24 control-loop tests/250 expectations, typecheck, severe
  lint, model validation, and eight generated views. Full integration passed
  with 338 Bun tests/1,757 expectations, zero Effect diagnostics, and 68
  transitional Python custody checks. Clean-head custody and re-review remain
  pending.
- 2026-07-31: tenth independent review rejected exact clean head `188f13f`.
  The conservative CSS matrices produced zero unsafe accepts, but four closed
  popover variants contributed prose despite Chromium reporting them hidden.
  The WHATWG user-agent rule hides every `[popover]` outside the
  `:popover-open` state except `dialog[open]`; an invalid popover value defaults
  to manual and a plain `open` attribute does not show a non-dialog popover.
- 2026-07-31: static HTML exclusion now implements that popover rule and its
  open-dialog exception. Focused evidence passes with 15 tests/112
  expectations, including bare, manual, invalid-value, irrelevant-open, and
  open-dialog cases, plus typecheck and formatting. Exact acceptance passes
  with 15 tests/112 expectations and the full integration gate passes with 338
  Bun tests/1,762 expectations, zero Effect diagnostics, and 68 transitional
  Python custody checks. Clean-head custody and re-review remain pending.
- 2026-07-31: eleventh independent review rejected exact clean head `dc2b9ab`.
  The expanded 53-case WHATWG/Chromium popover matrix and inherited 73-case
  CSS matrix produced zero unsafe accepts, but a fresh 59-case static HTML
  matrix found that supported `progress` and `meter` widgets do not render
  their fallback child text and the standard user-agent rule hides `rp`
  fallback parentheses in ruby annotations.
- 2026-07-31: `progress`, `meter`, and `rp` fallback subtrees are now excluded
  from acceptance prose, with focused regression fixtures. Exact acceptance
  passes with 15 tests/115 expectations and the full integration gate passes
  with 338 Bun tests/1,765 expectations, zero Effect diagnostics, and 68
  transitional Python custody checks. Clean-head custody and re-review remain
  pending.

## Acceptance command

```bash
bun scripts/accept/0015-open-semantic-system-design-lens.ts
```

Missing required artifacts or tools fail.
