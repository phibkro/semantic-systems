# Decision 0006: gated autonomous feature merges

## Question

How can the operator grant meaningful development autonomy while retaining
transparent, timely feedback and preventing unverified work from merging?

## Alternatives

1. Require operator approval for every merge.
2. Let the main agent merge any in-scope change based on its own judgment.
3. Grant merge authority only after a frozen feature contract, exact-head
   automated gates, independent review, a reproducible preview, evidence audit,
   completion feedback, and cleanup.

## Chosen option

Option 3. The main research/integration agent may autonomously merge a
nontrivial feature that satisfies design spec 0005. It does not wait for
operator acknowledgement after the gates pass.

The operator retains authority over thesis changes, weakened evidence/trust
meanings, incompatible public identity, legal/license decisions, secrets,
paid or shared infrastructure, public deployment, irreversible migrations,
and destructive actions outside a frozen feature contract.

## Rationale

Per-merge approval spends operator attention rechecking routine correctness.
Unbounded merge authority conflates implementation confidence with independent
evidence. A structural gate makes autonomy depend on inspectable referents:
the contract, exact commit, sensors, preview, review, and evidence limits.

The PR remains a durable completion report and the post-merge notice gives the
operator feedback without turning feedback into a blocking permission step.

## Confidence

High for bounded feature implementations with deterministic acceptance.
Moderate for foundational semantics and novel evidence mechanisms, which need
stronger advisory and review before the same gate can authorize merge.

## Reversibility

High. Required checks, authority scope, and notification policy can be
tightened immediately. Previously merged semantic artifacts remain bound to
their recorded evidence and invalidation conditions.

## Affected entities

Design specs, plans, feature branches, pull requests, CI, acceptance scripts,
review assignments, completion notices, agent tabs, worktrees, and branch
rules.

## Reopening condition

Reopen if an autonomously merged feature escapes a stated falsifier, exact-head
checks prove spoofable or excessively noisy, operator feedback is too late or
too verbose, or cleanup threatens unintegrated work.
