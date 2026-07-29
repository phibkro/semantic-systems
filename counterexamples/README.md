# Counterexample corpus

The executable source of truth is the fixture data under
`examples/inventory/evidence/` and the mutation tests in
`tests/test_inventory_tracer.py`.

For the inventory-resolution rule set, preserve:

- positive: reserve and release reconstruct the declared final state;
- minimal rejection: reserve above stock emits `ReservationRejected`;
- adversarial: a broken realization ignores the stock guard and must fail the
  same conformance suite;
- policy: proof-only policy rejects passing test evidence;
- identity: changing one law invalidates the theory identity;
- selection: two eligible candidates without an explicit choice are ambiguous.

Add a positive, minimal rejection, and subtle adversarial case for every new
semantic rule. Do not convert discovered counterexamples into prose-only notes.
