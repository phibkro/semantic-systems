# Design spec 0018: minimal kernel calculus

Status: frozen for the first language tracer

Date: 2026-07-31

Depends-On-Feature-IDs: 0015-open-semantic-system-design-lens

Design-Lens-Version: open-semantic-system-v1

## Problem

Semantic Systems describes a typed language kernel but does not run one.
The repository names CBPV, effect rows, usage grades, and one-shot handlers.
These names do not yet define one shared typing or operational judgment.

The executable semantic-system library from 0016 is a TypeScript authoring
carrier. It is not the future language or its trusted checker. Without a small
calculus, language work can drift toward parser design, host types, or runtime
features before the semantic center exists.

The project needs one closed and finite calculus. The calculus must accept,
reject, evaluate, and suspend terms with typed observations. It must expose
effect and usage errors before a surface language hides them.

## Felt journey

A language engineer constructs a closed term from the kernel AST. The term
forces a thunk, performs one `fresh.allocate` operation, and handles that
operation with one resumption.

The checker accepts the term. Its report contains the result type, the empty
residual effect row, and the usage of each binder. The evaluator returns the
expected integer and a finite trace.

The engineer then changes the handler clause to resume twice. The checker
rejects the term with `usage.affine-duplicated`. The evaluator never receives
authority to run the rejected term.

The engineer removes the handler. The checker accepts the declared effect row.
The evaluator returns a typed suspension for `fresh.allocate`. A caller can
resume that suspension once with a value of the declared operation result type.

## Open semantic system design lens

### Boundary and warranted state

Feature 0018 owns a host-neutral calculus contract and one TypeScript reference
implementation. The implementation owns decoded terms, checked programs,
machine states, one-shot tokens, and finite traces.

The checker warrants only derivations from the declared signature and term.
The evaluator warrants only transitions from a checked closed program. It does
not warrant that a returned external observation is true.

The feature does not own source text, names, modules, package identity, or
deployment. It does not own actors, STM, persistence, or operating-system
effects. Those concerns remain outside the calculus.

The TypeScript representation is a carrier for the judgments in this
contract. TypeScript assignability does not define those judgments.

### Semantic inputs

The feature accepts these input families:

- an operation signature.
- an unknown term for runtime decoding.
- a decoded term for static checking.
- a checked closed program for evaluation.
- finite evaluation bounds.
- a typed value that resumes an external suspension.

An operation signature maps each `(label, operation)` pair to one argument
type and one result type. Labels and operation names are nonempty strings.

Unknown input does not establish a well-formed term. A decoded term does not
establish correct typing. A checked program does not establish termination
within a selected fuel bound.

A suspension result is an observation of an unhandled operation request. It
does not establish that an external handler received or completed the request.

### Semantic outputs

Decoding returns a decoded term or structured decode diagnostics.

Checking returns one of these observations:

```text
Accepted(type, effects, usage, derivation)
Rejected(diagnostics)
```

Evaluation returns one of these observations:

```text
Returned(value, trace)
Suspended(request, oneShotToken, trace)
Exhausted(machineSnapshot, trace)
RuntimeRejected(diagnostic, trace)
```

The checker report and evaluation trace are derived artifacts. The decoded
term and operation signature are canonical inputs for one run.

`RuntimeRejected` reports a broken runtime boundary. It does not replace a
static rejection. Examples include a wrong external result type and reuse of a
consumed suspension token.

### Effect protocols and uncertainty

An effect row is a finite set of labels. Union is associative, commutative,
and idempotent. The empty set is the pure row.

An unhandled operation returns `Suspended`. The suspension contains the exact
label, operation, argument value, and declared result type. The suspension
token has private construction and one-shot custody.

A caller can resume a suspension with one value of the declared result type.
The evaluator rejects a wrong value before it changes the machine. A second
resume attempt returns `RuntimeRejected` with `resumption.already-used`.

An operation handler removes only its declared label. All other labels remain
in the residual effect row. Handler-clause effects remain visible in the
output row.

The evaluator does not retry, deduplicate, reconcile, or compensate an external
operation. A timeout remains environmental because this feature has no clock.

### Components and orthogonal structures

The feature contains four components:

```text
unknown input
  -> runtime decoder
  -> static checker
  -> checked-program custody
  -> bounded abstract machine
```

The decoder owns representation validation. The checker owns derivation
construction. The checked-program boundary owns execution authority. The
machine owns continuation and one-shot token state.

These structures remain separate:

- lexical scope and binder position.
- quantitative binder use.
- effect-row inclusion.
- operation dispatch.
- handler-delimited continuation state.
- external suspension custody.
- trace derivation.

The checker converts a decoded term into execution authority. This is a
semantic boundary. The evaluator converts an unhandled request into a
suspension observation. This is an effect boundary.

Each machine transition decreases fuel by one. A returned value terminates the
run. An unhandled operation waits in `Suspended`. Zero fuel returns
`Exhausted` with an exact machine snapshot.

### Bounded autonomy and resources

The first calculus has no recursion or recursive types. All accepted terms and
signatures are finite. Each public decode also has depth, node, string, and
collection bounds.

Evaluation has positive safe-integer bounds for transitions and retained trace
entries. Trace overflow returns `Exhausted`. The evaluator does not discard
trace entries and then claim a complete trace.

Each handler captures one finite continuation. Each internal or external
resumption token can be consumed at most once. The implementation has no
ambient network, file, clock, random, process, or console authority.

### Evidence, assumptions, and unsupported claims

Runtime schemas establish representation shape and bounds. The module boundary
establishes private custody for checked programs and resumption tokens.

Oracle tests establish selected typing and transition examples. Property tests
establish selected grade and row laws. Differential tests compare only the
overlap with an independent executable oracle.

The strongest local oracle is `lang-bang` at
`5b8e032bcffefb23a3a153d3f5cea99050e589c1`. Its Apache-2.0 Lean sources
separate values and computations, use finite-set rows, and define
`{0, 1, omega}` grades. Feature 0018 can adapt tested ideas with provenance.
It must not import `lang-bang` types or copy its language decisions.

The older `bang-lang` repository at
`54b0a27b993d59f8ff28d99a66a1aeec3be03e37` is an informal behavior oracle.
No license file was present during contract work. Therefore no source can be
copied from that repository.

This evidence does not establish:

- progress or preservation for all terms.
- a proof of type soundness.
- principality or complete inference.
- semantic equivalence with `lang-bang`.
- termination without a fuel bound.
- truth or delivery of external effects.
- stable package identity.
- a trusted production checker.
- safety against hostile process termination.

## Deep-module contract

### Semantic alphabet

The calculus uses three grades:

```text
q ::= 0 | 1 | omega
```

`0` permits no use. `1` permits at most one use. `omega` permits any finite
use. The ordering is `0 <= 1 <= omega`.

Grade addition and multiplication use these tables:

```text
+      0      1      omega
0      0      1      omega
1      1      omega  omega
omega  omega  omega  omega

*      0      1      omega
0      0      0      0
1      0      1      omega
omega  0      omega  omega
```

The checker infers an upper-use vector. A binder with grade `q` accepts an
inferred use `u` only when `u <= q`.

Effect rows are finite sets:

```text
epsilon ::= {} | {label_1, ..., label_n}
```

Rows use set equality. Duplicate labels do not change a row.

The first value and computation types are:

```text
A ::= Unit
    | Bool
    | Int
    | A * B
    | U(epsilon, C)

C ::= F[q] A
    | A ->[q] (epsilon, C)
```

`U(epsilon, C)` is a thunk. Forcing it runs a computation of type `C` with
latent effects `epsilon`.

The actual return type is `F[q] A`, not ungraded `F A`. Grade `q` records the
consumer demand for the returned value.

`A ->[q] (epsilon, C)` is a computation-level function. Its argument has usage
limit `q`. Applying it produces `C` with latent effects `epsilon`.

The first terms are:

```text
V ::= variable(index)
    | unit
    | bool(value)
    | int(value)
    | pair(V, V)
    | thunk(M)

M ::= return(q, V)
    | let(M, M)
    | force(V)
    | lambda(A, q, M)
    | apply(M, V)
    | operation(q, label, name, V)
    | handle(label, M, returnClause, operationClauses)
    | resume(resumptionBinder, V)
```

Terms use de Bruijn indices for ordinary binders. The contract does not define
surface names or alpha-equivalence.

A resumption binder is not an ordinary value. It can occur only as the first
operand of `resume`. It cannot enter a pair, thunk, return value, operation
argument, or final result.

### Static judgments

The contract defines these judgments independently of TypeScript types:

```text
Sigma ; Gamma |-v V : A         ! usage
Sigma ; Gamma |-c M : C ; row   ! usage
Sigma ; Gamma |-h H : handler(label, A, C, row)
```

`Sigma` is the finite operation signature. `Gamma` is the ordered value-type
context. `usage` has one grade for each entry in `Gamma`.

The implementation must retain a derivation node for each successful rule. A
rejection identifies the failed rule, term path, and relevant expected facts.

The value rules have these required effects:

- a variable contributes the basis vector with `1` at its index.
- a constant contributes the zero vector.
- a pair adds the usage vectors of both fields.
- a thunk retains the usage vector of its computation.

`return(q, V)` has an empty effect row and type `F[q] A`. Its outer usage is
`q * usage(V)`.

`force(V)` exposes the latent row from `U(epsilon, C)`.

Define `atLeastOnce(0) = 1`. For other grades,
`atLeastOnce(q) = q`.

Assume that `M` has type `F[q1] A`. Assume that `N` has type `F[q2] B`.
`N` binds the result of `M` at index zero.

The bound entry for `N` is `q1 * atLeastOnce(q2)`. The outer usage is
`atLeastOnce(q2) * usage(M) + usage(N without the binder)`.

The `atLeastOnce` floor records strict sequencing. The machine runs `M` once
even when the result of `N` has grade `0`.

`lambda(A, q, M)` binds one argument. The body use must be less than or equal
to `q`. Constructing the function has an empty row. The
function type records the body row.

`apply(M, V)` combines the row of `M` with the function body row. It scales the
usage of `V` by the argument grade and adds all remaining usage.

For `operation(q, label, name, V)`, `Sigma(label, name)` supplies the argument
and result types. Its type is `F[q] A`. Its row is exactly `{label}`.

### Handler judgment

`handle(label, M, R, O)` is a deep handler for one label. It has one return
clause and exactly one clause for each operation under that label in `Sigma`.

Assume that `M` has type `F[q] A` and row `epsilonM`. The checker requires
`epsilonM` to be a subset of `{label} union rho`. The residual row `rho` does
not contain `label`.

The return clause binds one `A` value. It returns `F[q] B` with row
`rho union delta`.

Each operation clause binds its operation argument and one resumption binder.
The resumption accepts the declared operation result type. It continues the
captured computation under the same deep handler.

Each resumption binder has grade `1`. The clause can ignore it or resume it
once. Duplicate use infers `omega` and fails with `usage.affine-duplicated`.

Each clause returns `F[q] B` with row `rho union delta`. Clause-local effects
contribute to `delta`. The handler result has type `F[q] B` and row
`rho union delta`.

The handler cannot remove a label from `rho`. The checker reports
`effect.foreign-tunneling` if a claimed output row hides a residual label.

### Operational judgment

The evaluator uses a deterministic call-by-push-value abstract machine:

```text
machine --step--> machine
machine --return--> value
machine --suspend--> request + oneShotToken
```

Evaluation order is left to right. `return` supplies a value to the nearest
continuation frame. `let` installs one continuation frame.

`force(thunk(M))` continues with `M`. Applying a lambda substitutes the
argument through one machine environment entry.

An operation searches outward for the nearest matching handler. A matching
handler captures the frames up to that handler. Then it runs the selected
clause with a fresh internal resumption token.

`resume(k, V)` consumes `k` and reinstalls the same deep handler. It places `V`
at the captured operation return point. A second consumption returns
`resumption.already-used`.

An unmatched operation returns `Suspended`. Resuming the external token places
the supplied value at the operation return point. A second resume attempt
returns `resumption.already-used`.

Every transition appends a normalized trace entry. Trace entries identify the
rule, term path, row-relevant operation, and resumption identity where
applicable.

### Public module

The first implementation lives under `src/kernel-calculus/`. One documented
entry point exports:

- immutable AST and signature constructors.
- bounded unknown-input decoders.
- `check`.
- `evaluate`.
- `resume`.
- result and diagnostic schemas.
- normalized report helpers.

The entry point does not export:

- raw checked-program constructors.
- raw resumption-token constructors.
- mutable machine internals.
- host-runtime adapters.
- ambient effect authority.

The implementation uses TypeScript 7, Bun, Effect v4, Oxfmt, and Oxlint. A
genuine Node entry point runs the same portable checker and evaluator.

## Oracle-first counterexamples

Retain executable rejection or runtime observations for these cases:

1. A value term appears where a computation is required.
2. A computation term appears where a value is required.
3. One affine binder appears twice.
4. One resumption binder appears twice.
5. One resumption binder escapes through a thunk, pair, return, or operation.
6. One consumed internal resumption runs a second time.
7. One consumed external suspension runs a second time.
8. A handler hides a foreign residual effect.
9. Duplicate row labels change equality or output order.
10. `force(thunk(return(V)))` differs from `return(V)`.
11. An operation argument has the wrong type.
12. A handler clause resumes with the wrong result type.
13. An unhandled operation reports completion instead of suspension.
14. Zero fuel reports completion instead of exact exhaustion.
15. Malformed unknown input reaches the checker.
16. An unchecked structural lookalike reaches the evaluator.
17. A later input mutation changes a checked program or prior result.
18. Bun and Node return different normalized observations.

Positive oracles must include:

1. pure return and sequencing.
2. unused `0` binders.
3. single-use `1` binders.
4. repeated `omega` binders.
5. thunk and force.
6. row union idempotence.
7. one deep handled operation.
8. one zero-shot clause.
9. one unhandled suspension and typed resume.
10. one nested foreign operation that remains visible.

## Acceptance

Feature 0018 is accepted only when:

1. the design spec states syntax, typing, usage, effects, and transitions.
2. the public API hides checked-program and resumption constructors.
3. runtime decoding rejects malformed or over-bound unknown input.
4. the checker emits typed accept or reject observations with derivation data.
5. the evaluator runs checked closed terms only.
6. all eighteen counterexample families have focused tests.
7. all ten positive oracle families have focused tests.
8. grade tables and set-row laws pass exhaustive finite property tests.
9. internal and external resumptions have static and runtime one-shot gates.
10. unhandled operations suspend with exact typed request data.
11. fuel and trace bounds return exact exhaustion data.
12. the portable closure has no ambient runtime authority.
13. overlapping fixtures agree with the pinned `lang-bang` oracle.
14. Bun and genuine Node produce byte-identical normalized reports.
15. typecheck, strict lint, formatting, and project-model gates pass.
16. exact feature acceptance and full integration pass at one clean head.

The exact acceptance command is:

```bash
bun scripts/accept/0018-minimal-kernel-calculus.ts
```

## Kill or redesign criteria

Stop or recut the feature if:

- the rules require TypeScript assignability to define language typing.
- one-shot safety depends only on a private JavaScript field.
- handlers can erase unrelated effect labels.
- the AST requires source names or a parser to evaluate.
- the evaluator grows actor, STM, package, or deployment behavior.
- differential agreement requires copying another language implementation.
- the public API exposes mutable machine or token authority.
- the contract cannot explain each accepted and rejected fixture.

## Non-goals

- Surface syntax, parser, formatter, elaborator, or language server.
- Polymorphism, row variables, subeffect inference, or type-class search.
- Recursive terms, recursive types, coinduction, or general termination.
- Stable normalized identity, hashing, or binder-equivalence policy.
- Proof terms, propositions, universes, or dependent types.
- Actors, STM, CRDTs, scheduling, persistence, or external handlers.
- Ownership, borrowing, regions, or runtime memory layout.
- Optimization, CBPV lowering, SSA, Wasm, native code, or package transport.
- A compatibility promise with `lang-bang` or `bang-lang`.
- A proof of progress, preservation, or type soundness.

## Semantic diff

The project gains its first executable language calculus. Value and computation
forms, finite effect rows, quantitative use, and one-shot handlers now have
shared operational observations.

The TypeScript semantic-system library remains a domain authoring carrier.
Inventory, actor, STM, package, evidence, and deployment semantics remain
unchanged.

The feature does not define source syntax or normalized package identity. It
creates the checked semantic seam that those later features can consume.
