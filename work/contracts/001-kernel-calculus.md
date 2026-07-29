# Work Contract: Minimal Kernel Calculus

## Objective

Produce the first reviewable semantic specification for the trusted kernel.

## Inputs

- `docs/stratified-design.md`
- theories `theory.cbpv`, `theory.usage`, `theory.effects`, and `theory.prop`
- accepted decision `decision.one-shot`

## Outputs

- syntax and judgments for the minimal core;
- typing rules for values and computations;
- usage rules for erased, affine, linear, and unrestricted bindings;
- one-shot effect-handler rules;
- proof-erasure boundary;
- small executable examples and counterexamples.

## Allowed scope

- `spec/core/**`
- `docs/stratified-design.md`
- new semantic model entities and relations directly required by the calculus

## Forbidden scope

- package-resolution semantics;
- STM implementation details;
- backend representation;
- multi-shot continuations.

## Acceptance

1. Every judgment and metavariable is defined.
2. Affine capture by one-shot resumptions is specified.
3. At least five positive and five negative examples are executable or
   mechanically checkable.
4. Open assumptions and unproved metatheorems are listed explicitly.

## Delegation

Human-led semantic design. Agents may compare calculi, formalize rules already
chosen, generate examples, and search for counterexamples.

## Review

Architecture owner approves changes to the trusted semantic boundary.
