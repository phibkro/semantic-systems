# Workflow comparison rubric

Frozen before the custom workflow result was available.

The generic `/deep-research` run and the custom model-routed workflow are
compared against design spec 0002. A polished report cannot compensate for a
failed hard gate.

## Hard gates

- At least twelve projects cover every required comparison class.
- Every accepted fact has a primary source and bounded evidence scope.
- Accepted code-pattern candidates record source version or commit and license.
- Fact, inference, recommendation, unverified, and refuted remain distinct.
- The required project-card fields survive aggregation.
- Model and effort routing observed at runtime matches the declared route.
- No external project or agent becomes semantic authority.
- The output contains at least one bounded, falsifiable local experiment.

## Measured operational fields

- elapsed wall time;
- agent calls by stage;
- peak live concurrency;
- model and effort calls by stage;
- output tokens and tool calls;
- source candidates, fetches, and primary-source ratio;
- extracted, verified, refuted, and unverified claims;
- retries, failures, and persisted partial work;
- project-card completeness;
- hard-gate failures.

## Quality comparison

For each workflow, record:

1. coverage and missing classes;
2. provenance preservation;
3. contradiction and counterexample handling;
4. trust and license visibility;
5. enforceability-rung accuracy;
6. project-boundary specificity;
7. experiment quality;
8. cost concentration by reasoning class.

No single weighted score is used. Hard-gate conformance, epistemic quality, and
operational cost remain separate observations.

## Native baseline observation

The completed native run used 109 inherited Fable 5/high agents in 15 minutes
41 seconds. It verified 25 of 134 extracted claims and produced nine merged
project findings. It missed the twelve-project coverage gate, all required
license fields, and the frozen project-card schema. These values remain
provisional until the main agent checks the persisted result.
