# Independent resolution-checker recut experiment

Date: 2026-07-30

Contract: `design-specs/0003-independent-resolution-checker.md`

Uncertainty: `uncertainties/0004-independent-checker-recut.md`

Source inspected read-only:
`7297321021615b9c30151f1542e529a5a7e1b42e`

Rejected prior experiment: `a373ae955bae3b986ef028571cc14b79fc19f4ae`

Revert: `adf7e8d4de5d43a3445ec5fcf06269d91cef9e7b`

## Question

Can any of the three recuts prescribed by uncertainty 0004 satisfy the frozen
checker behavior, mutation corpus, forbidden-capability closure, and honest
70% checker-to-production adjudication size gate?

The disposable TypeScript experiment compared:

1. one shared declarative rule table interpreted by two independently written
   evaluators;
2. a minimal resolution certificate with exact whole-input binding; and
3. a recut claim separating structural packet validation from independent
   semantic eligibility recomputation.

The pure decision cores used ordinary total TypeScript. Effect was not added
because the prototypes contained no capability boundary.

## Exact result

| Option | Production | Checker | Ratio | Mutations rejected | Strong rebound | 70% gate |
|---|---:|---:|---:|---:|---|---|
| Declarative rule table | 81 | 186 | 229.6% | 20/21 | accepted | fail |
| Minimal certificate | 67 | 77 | 114.9% | 19/21 | accepted | fail |
| Structural/semantic recut | 72 | 166 | 230.6% | 20/21 | accepted | fail |

Counts are nonblank, noncomment physical lines inside explicit adjudication
regions. Production counts include policy decisions, terminal selection, exact
selected identity, and assumption projection. Checker counts include semantic
comparison, complete candidate and foreign-packet handling, exact bindings,
terminal checks, and assumption checks. Shape-only decoding and explanations
were measured separately. No serializer, reporter, fixture builder, test, or
measurement code enlarged the production denominator.

The rule-table option additionally has a 19-line shared semantic contract.
Counting that contract symmetrically still gives `(186 + 19) / (81 + 19) =
205%`; it remains a correlated authority and still fails the gate.

## Strongest rebound

The decisive mutation copied the complete two-case passing observation payload
from the lawful pure realization to the authored broken realization, updated
every producer-controlled subject and recipe binding consistently, recomputed
the packet identity, and then let each producer re-derive its complete claim or
certificate.

The preserved and rebound observation digests were identical:

```text
sha256:ef169a6be9bbbef23ed089d28027e31872c65a7ff686e732827a9a0be1efa8b5
```

Both packets therefore appeared eligible, so every producer correctly emitted
the resolution result `rejected: ambiguous_candidates`. Every checker accepted
that result as internally consistent. Execution remained blocked by ambiguity,
but the checker did not classify the rebound artifact as invalid, contrary to
the frozen mutation requirement.

The independently available authored inputs establish the broken realization
identity, theory, obligation, recipe, category, policy, assumptions, case IDs,
and case count. They do not establish which observations the broken
implementation produced. The canonical graph's historical passed count is
derived from the same execution boundary, not an independently authenticated
observation.

Recomputing a serialization identity establishes integrity relative to the
supplied bytes. It does not establish observation authenticity.

## Other mutation evidence

The recomputing rule-table and recut checkers rejected:

- recipes supplied as results;
- evidence-category relabeling;
- stale case, subject, eligibility, reason, terminal, and assumption fields;
- candidate omission and duplication;
- policy and canonical-model drift;
- foreign outcomes;
- wrong obligations;
- unsupported ambiguity;
- duplicate authored candidates; and
- a self-consistent producer eligibility lie.

The certificate checker accepted the self-consistent eligibility lie because
it validates producer consistency rather than independently recomputing the
eligibility decision. All three accepted the fully rebound observation.

## Independence and capability evidence

The deterministic closure scanner followed every relative import, including
type-only imports. None of the three checker closures imported a production
evaluator, evidence runner, operation registry, domain transition, execution
module, demo, filesystem, network, subprocess, plugin loader, mutation
capability, or source-worktree module.

All three shared a lab-local canonical JSON and SHA-256 helper. That remains an
explicit correlated-TCB assumption. The measurement program's filesystem reads
were outside every checker closure.

## Conclusion

No option satisfies frozen design spec 0003. The experiment therefore grants
no evidence to claim CLM-0002 and does not justify integrating any prototype.

Option 3 is the smallest honest basis for a revised claim: it can validate
structural and policy consistency while reporting observation authenticity as
`not_established`. It cannot be called a solution to the current contract.

The smallest falsifiable next step is to decide explicitly between:

1. adding an independently produced `ObservationCustody` input binding recipe,
   realization, and case-observation digest; or
2. narrowing the frozen claim so the checker establishes internal consistency,
   not authenticity, and removing the impossible fully self-consistent rebound
   requirement.

With an independent custody record, the next single falsifier is:

- a rebound must fail `observation_commitment_mismatch`;
- absence of custody must report `subject_authenticity_not_established`; and
- a genuine broken packet must match its independently acquired commitment.

If no independent observation source is acceptable, the contract must not
claim that a non-executing checker authenticates producer-owned observations.

## Bounded validation

The integrating agent independently reran:

```bash
bun test /tmp/semantic-checker-recut-lab
bun /tmp/semantic-checker-recut-lab/matrix.ts
```

Observed: 12 tests passed, 0 failed, 115 assertions; the deterministic matrix
reproduced the exact counts and mutation results above. No Pagu, network, Nix,
hydration, broad tests, fuzzing, or model checking was used.
