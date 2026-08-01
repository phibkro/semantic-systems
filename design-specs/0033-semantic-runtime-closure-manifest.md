# Design spec 0033: semantic runtime-closure manifest

Status: frozen for one bounded compiler-to-build closure journey

Date: 2026-08-01

Depends-On-Feature-IDs: 0027-semantic-artifact-store,
0030-reachability-analysis-receipt

Design-Lens-Version: open-semantic-system-v1

## Problem

Feature 0027 stores accepted semantic values and exact normalized-core artifact
variants. Feature 0030 derives a content-addressed closure over one explicit
runtime-dependency graph. Neither artifact records which exact input variants
belong to one requested runtime closure. A build or deployment layer therefore
cannot name “what runs together” without reinterpreting authored names,
choosing an artifact implicitly, or treating a reachability analysis as if it
were an executable package.

The next tracer needs one self-contained manifest that joins these accepted
relations without collapsing their identities or authorities. It must retain
the complete reachability receipt, select exactly one present artifact variant
for every reachable semantic value, exclude every unreachable value, and bind
that selection to a new domain-separated manifest identity.

## Felt journey

A caller stores semantic values A, B, and C, with two source-correspondence
variants for A. It analyzes a declared graph where A reaches B and C is
unreachable. The caller supplies the canonical reachability receipt bytes and
an artifact-selection JSON choosing one exact variant for A and one for B.

The builder returns immutable canonical bytes for a manifest containing the
accepted analysis, A and B in deterministic order, the selected exact artifact
identities, and C as explicitly excluded. Repeating or permuting the selection
returns identical bytes. Selecting A's other artifact variant preserves the
semantic closure and changes only the manifest identity and A's selected
artifact. A missing, extra, unreachable, foreign, or mismatched selection
returns a typed rejection before any manifest is emitted.

## Open semantic system design lens

### Boundary and warranted state

Feature 0033 owns representation capture, one semantic-store snapshot,
revalidation of the embedded 0030 receipt against that same snapshot, exact
artifact-selection coverage, canonical ordering, domain-separated identity,
and immutable manifest bytes.

The manifest warrants only these claims:

- the embedded 0030 receipt was canonically recomputed against the one captured
  0027 store snapshot;
- every selected semantic identity is exactly one reachable identity from that
  receipt;
- every selected artifact identity was present under its semantic identity in
  that same snapshot;
- no unreachable or outside-universe semantic identity enters the members;
- `excluded_semantic_identities` is exactly the receipt's unreachable set; and
- the manifest identity binds the complete normalized document except its own
  identity field.

The manifest does not warrant that caller-declared graph edges are complete or
semantically extracted. It does not warrant that a caller-selected artifact is
an executable binary. It is a compiler-to-build input-closure artifact, not an
execution or deployment observation.

### Semantic inputs

`buildRuntimeClosure(receiptBytes, selectionJson)` accepts two unknown values.
Both representations are captured and decoded before the store is observed.
`receiptBytes` must be exact canonical `semantic.reachability-receipt` bytes.
`selectionJson` must be a primitive JSON string whose closed decoded shape is:

```text
{
  "format": "semantic.runtime-artifact-selection",
  "version": 1,
  "members": [
    {
      "semantic_identity": Identity,
      "artifact_identity": Identity
    }...
  ]
}
```

Member order is presentation only. Semantic identities must be unique. The
selection must cover the receipt's reachable set exactly: no missing, extra,
unreachable, or duplicate semantic identity is admitted. Artifact identities
are exact 0019 artifact identities under their corresponding stored semantic
value. Authored names never enter selection.

`validateRuntimeClosureBytes(unknown)` captures one candidate manifest byte
sequence, reads one store snapshot, recomputes the embedded analysis and
manifest identity, and returns the same immutable manifest only when the bytes
are exact canonical output.

### Semantic outputs

Successful construction returns one artifact containing the immutable
manifest and defensive-copy bytes. The manifest is exactly:

```text
{
  "format": "semantic.runtime-closure-manifest",
  "version": 1,
  "status": "assembled",
  "procedure_identity": "semantic.language-build/runtime-closure/0033/v1",
  "edge_authority": "caller-declared",
  "artifact_selection_authority": "caller-selected",
  "analysis": ReachabilityReceipt,
  "root_semantic_identity": Identity,
  "members": [
    {
      "semantic_identity": Identity,
      "artifact_identity": Identity
    }...
  ],
  "excluded_semantic_identities": [Identity...],
  "member_count": Integer,
  "excluded_count": Integer,
  "manifest_identity": Identity
}
```

Members and excluded identities use ascending UTF-16 code-unit order.
`root_semantic_identity` repeats the embedded root as an intentional query
field and must equal it. Counts are recomputed facts. Canonical bytes contain
the exact document followed by one line feed.

The identity domain is:

```text
semantic.language-build/runtime-closure-manifest/v1
```

Its preimage is the UTF-8 domain, one zero byte, and canonical JSON bytes for
the complete normalized manifest payload without `manifest_identity`.

Expected failures remain tagged: receipt representation or semantic
revalidation failure, selection representation failure, selection coverage or
store-membership rejection, manifest byte rejection, or digest-service
failure. No rejection returns an identity-shaped placeholder.

### Effect protocols and uncertainty

Each public operation captures its complete byte/text input before requesting
`SemanticStore.snapshot`. It reads that snapshot exactly once. Receipt
revalidation, artifact membership, and manifest assembly consume only that
immutable observation. Concurrent store mutation can affect a later request
but cannot split one operation across store generations.

`Crypto.Crypto` owns SHA-256 observations. Digest failure remains typed. The
module owns no state, queue, filesystem, process, network, clock, random,
console, retry, or background fiber. Repeated equal inputs against equal store
snapshots are idempotent and return equal bytes.

### Components and orthogonal structures

```text
receipt bytes ---------> exact 0030 decode ----+
selection JSON --------> strict selection -----+--> captured inputs
                                                  |
SemanticStore ---------> one snapshot ----------+
                                                  v
                        recomputed reachability receipt
                                      +
                        exact reachable artifact selection
                                      |
                                      v
                        immutable runtime-closure manifest
```

Store custody, dependency-edge declaration, reachability derivation, artifact
selection, manifest derivation, and future execution stay distinct. Embedding
the receipt preserves its evidence and authority instead of replacing it with
one opaque digest. The manifest crosses from compiler analysis vocabulary into
build-input closure vocabulary; it does not cross into runtime observation.

### Bounded autonomy and resources

- receipt and manifest bytes inherit the 0030 maximum of 1,048,576 bytes;
- selection JSON is limited to 1,048,576 UTF-8 bytes, depth 64, and 16,384 JSON
  values;
- member selection is limited to 1,024 entries, matching the 0027 semantic
  value and 0030 node bounds;
- the captured store already limits replay to 1,024 semantic values and 4,096
  exact artifact variants; and
- normalization and validation visit each admitted node, member, and stored
  artifact at most a fixed number of times.

No hidden unbounded continuation, multi-shot handler, retry, or background
retention is introduced.

### Evidence, assumptions, and unsupported claims

Runtime-validation tests will observe exact selection, permutation invariance,
variant sensitivity, one-snapshot custody, canonical byte revalidation,
immutability, and typed rejection for malformed, duplicate, missing, extra,
unreachable, foreign, stale, and digest-failing cases. Genuine Node/Bun parity
will compare canonical bytes. TypeScript 7 with Effect diagnostics checks
requirements and error channels. Effect Schema checks the selection and
manifest representation boundaries. Architecture scans keep ambient authority
out of the portable closure.

These observations are tests and static analysis, not proof. The feature
assumes the accepted 0019, 0027, and 0030 contracts and the supplied Crypto
service. It does not prove graph completeness, artifact executability,
reproducible action execution, Nix derivation equivalence, cache benefit,
deployment success, or SHA-256 collision resistance.

## Deep-module contract

The public surface adds exactly two operations:

```text
buildRuntimeClosure(receiptBytes, selectionJson)
validateRuntimeClosureBytes(manifestBytes)
```

Both return typed Effects requiring `SemanticStore | Crypto.Crypto`. The module
may change its private maps, codecs, and traversal helpers while preserving the
frozen document, authority labels, identity rule, single-snapshot semantics,
canonical bytes, resource bounds, and failure ownership.

The existing public 0030 validation operation remains unchanged. A private
snapshot-parameterized helper may be extracted so 0030 and 0033 share one
receipt authority without performing two store observations.

## Oracle-first counterexamples

1. The exact reachable set with present artifact variants assembles and
   validates byte-for-byte.
2. Permuting members cannot change the manifest or identity.
3. Choosing a different present artifact variant changes the manifest identity
   but not the embedded semantic closure.
4. Missing, extra, duplicate, unreachable, or outside-universe members reject.
5. An artifact identity present under a different semantic value rejects.
6. An authored-name binding cannot satisfy an absent member or choose a
   variant.
7. A forged or stale embedded reachability receipt rejects even if the outer
   manifest identity is refreshed.
8. A store whose observation would change on a second read is observed once.
9. Invalid bytes or selection JSON consume no store observation.
10. A digest defect returns a typed failure and no manifest.
11. Caller mutation of input or returned byte copies cannot change a prior
    manifest.

## Acceptance

Run:

```bash
bun scripts/accept/0033-semantic-runtime-closure-manifest.ts
```

Acceptance requires the frozen contract, plan, model item, portable module,
focused Bun and genuine Node tests, TypeScript 7 Effect diagnostics, Oxlint,
Oxfmt, deterministic project projections, current 0027/0030 seam tests, the
complete repository gate, and revision-pinned independent review before
integration.

## Kill or redesign criteria

Redesign before integration if construction needs two store observations,
trusts a caller-supplied receipt or identity, chooses an artifact implicitly,
lets names enter closure meaning, cannot validate its own bytes, hides edge or
selection authority, exposes mutable aliases, or claims execution from an
assembled manifest. Recut the format before adding compiled bytecode, external
build actions, Nix store paths, signatures, persistence, or deployment state.

## Non-goals

- Compiler-derived dependency extraction or completeness claims.
- Dead-code rewriting inside one semantic value.
- Bytecode serialization or optimization.
- Running commands, builds, tests, deployments, or Nix derivations.
- Filesystem persistence, remote transfer, publication, garbage collection,
  signatures, or attestations.
- Treating normalized-core artifact variants as executable binaries.

## Semantic diff

Before 0033, the system can store accepted semantic values and analyze one
declared dependency graph, but no accepted artifact names the exact semantic
and artifact inputs that form a requested runtime closure. After 0033, one
canonical content-addressed manifest records that bounded join while preserving
store custody, caller-declared edge authority, caller-selected artifact policy,
and the distinction between assembly and execution. The semantics of 0019,
0027, 0030, and the process-local 0032 bytecode graph remain unchanged.
