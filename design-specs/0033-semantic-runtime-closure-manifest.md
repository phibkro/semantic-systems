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

The next tracer needs one transport-neutral manifest that joins these accepted
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

Feature 0033 owns representation capture, bounded admission of one explicit
0027 semantic-store snapshot input, one normalized snapshot of the resulting
private ephemeral store, revalidation of the embedded 0030 receipt against
that observation, exact artifact-selection coverage, canonical ordering,
domain-separated identity, and immutable manifest bytes.

The manifest warrants only these claims:

- the supplied 0027 snapshot passed the accepted bounded replay authority and
  the embedded 0030 receipt was canonically recomputed against its normalized
  private-store projection;
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

`buildRuntimeClosure(storeSnapshot, receiptBytes, selectionJson)` accepts three
unknown values. The receipt and selection representations are captured and
decoded before the store snapshot input is inspected. `storeSnapshot` must pass
the existing 0027 `SemanticStore.replay` boundary inside a fresh private
`SemanticStoreLayer`; replay's structural preflight and frozen 1,024/4,096
limits are the semantic-value and artifact admission authority. Because
authored names have no accepted byte bound and do not participate in 0033
meaning, a defect-contained constant-field preflight runs before replay. It
inspects only the root `name_bindings` own data descriptor and that value's
plain dense-array shape and admitted `length`; the length must be zero and no
binding element is read. Proxy traps, accessors, non-plain arrays, sparse or
extended arrays, moving length, and nonzero length reject as
`RuntimeClosureSnapshotRejected`. Only a snapshot admitted as exactly
`name_bindings: []` may enter unchanged 0027 replay. After replay succeeds, the
operation reads one normalized snapshot from that private store and uses only
that immutable value.

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

Receipt and manifest byte inputs reuse 0030 custody: only genuine
`Uint8Array` values are admitted, bytes are defensively copied, the
1,048,576-byte limit is checked before decoding, and UTF-8 decoding is fatal.
Receipt, selection, and manifest JSON all use the accepted scanner before
Effect Schema decoding. Duplicate object keys, depth above 64, or more than
16,384 JSON values reject. Typed-array lookalikes and other byte containers
reject.

`validateRuntimeClosureBytes(storeSnapshot, manifestBytes)` first captures and
decodes the complete candidate manifest before it inspects the snapshot input.
It then admits the explicit 0027 snapshot through a fresh private store, reads
one normalized snapshot, recomputes the embedded analysis and manifest
identity, and returns the same immutable manifest only when the bytes are exact
canonical output. The manifest embeds its complete analysis but not the store's
canonical artifact bytes, so custody revalidation always requires the explicit
store snapshot input.

The supplied snapshot is a validation witness, not part of the manifest
identity. Unreferenced semantic values or artifact variants may be added to a
later witness without invalidating the manifest. Authored names remain absent
from the admitted witness. A manifest is stale only when a referenced semantic
value or selected artifact is absent or has changed, or when its embedded
receipt no longer revalidates.

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
revalidation failure, selection representation failure, snapshot
representation or bounded-replay failure, selection coverage or
store-membership rejection, manifest byte rejection, or digest-service
failure. No rejection returns an identity-shaped placeholder.

0033 owns the tags `RuntimeClosureSelectionRejected`,
`RuntimeClosureSnapshotRejected`, `RuntimeClosureMembershipRejected`,
`RuntimeClosureManifestRejected`, and `RuntimeClosureDigestFailure`. Existing
0030 receipt, graph, and digest failures remain visible when 0030 owns the
rejection. The name-free preflight rejection and 0027
`SemanticStoreSnapshotRejected` map to `RuntimeClosureSnapshotRejected`.
`NormalizedCoreDigestFailure` from replay maps to
`RuntimeClosureDigestFailure` and preserves the replay phase. Unexpected
implementation defects remain defects; they are not relabeled as input
rejections. No replay failure leaks a partially replayed store.

### Effect protocols and uncertainty

Each public operation captures its complete byte/text input before inspecting
the snapshot input. It creates one private `SemanticStoreLayer`, replays the
untrusted snapshot through 0027's bounded admission path, and reads the
normalized private state exactly once. Receipt revalidation, artifact
membership, and manifest assembly consume only that immutable observation. No
caller can mutate the private store between replay and observation, and no
ambient live store can introduce an unbounded or split-generation snapshot.

`Crypto.Crypto` owns SHA-256 observations. Digest failure remains typed. The
ephemeral in-memory store is scoped to one operation and has no externally
reachable mutation path. The module owns no persistent state, queue,
filesystem, process, network, clock, random, console, retry, or background
fiber. Repeated equal inputs are idempotent and return equal bytes.

### Components and orthogonal structures

```text
receipt bytes ---------> exact 0030 decode --------+
selection JSON --------> strict selection ---------+--> captured inputs
store snapshot input --> bounded 0027 replay ------+
                                                    |
private SemanticStore -> one normalized snapshot --+
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
- the supplied snapshot is admitted by 0027 replay before use: at most 1,024
  semantic values, 4,096 total exact artifact variants, and exactly zero
  authored-name bindings; and
- normalization and validation visit each admitted node, member, and stored
  artifact at most a fixed number of times.

No hidden unbounded continuation, multi-shot handler, retry, or background
retention is introduced.

### Evidence, assumptions, and unsupported claims

Runtime-validation tests will observe exact selection, permutation invariance,
variant sensitivity, one-snapshot custody, canonical byte revalidation,
immutability, witness extension invariance, and typed rejection for malformed,
duplicate, missing, extra, unreachable, foreign, stale, snapshot, replay, and
digest-failing cases. Genuine Node/Bun parity will compare canonical bytes.
TypeScript 7 with Effect diagnostics checks
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
buildRuntimeClosure(storeSnapshot, receiptBytes, selectionJson)
validateRuntimeClosureBytes(storeSnapshot, manifestBytes)
```

Both return typed Effects requiring only `Crypto.Crypto`; the bounded in-memory
`SemanticStoreLayer` is a private deterministic interpreter for the explicit
snapshot input. The module may change its private maps, codecs, and traversal
helpers while preserving the frozen document, authority labels, identity rule,
bounded replay, single normalized observation, canonical bytes, resource
bounds, and failure ownership.

The existing public 0030 validation operation remains unchanged. The
reachability module adds one internal, non-barrel-exported orchestration seam:

```text
withValidatedReceiptSnapshot(receiptBytes, use)
```

The seam captures and decodes the receipt, obtains `SemanticStore`, reads its
snapshot exactly once, recomputes the receipt, and only then invokes `use` with
the accepted receipt and immutable captured snapshot. It accepts no structural
snapshot from its caller. Feature 0033 invokes this seam inside the fresh
private store Layer created by bounded replay. This preserves one 0030 receipt
authority without exposing a forgeable snapshot-parameterized validator.

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
8. A named snapshot rejects in the constant-field preflight before replay. An
   over-limit, sparse, moving, aliased, or forged name-free snapshot fails
   through accepted bounded 0027 replay before manifest work.
9. Invalid receipt bytes or selection JSON do not inspect the snapshot input.
10. A Crypto digest-service failure returns its owning typed failure and no
    manifest.
11. Caller mutation of input or returned byte copies cannot change a prior
    manifest.
12. Adding an unreferenced semantic value or artifact variant to a later
    name-free witness does not invalidate or rename a prior manifest.
13. The maximum legal 1,024-node, 4,096-edge, 1,024-member shape constructs and
    revalidates within the output-byte bound.

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

Redesign before integration if construction depends on an ambient live store,
needs more than one normalized observation after bounded replay, trusts a
caller-supplied receipt or identity, chooses an artifact implicitly, lets names
enter closure meaning, cannot validate its own bytes against an explicit store
snapshot, hides edge or selection authority, exposes mutable aliases, or
claims execution from an assembled manifest. Recut the format before adding
compiled bytecode, external build actions, Nix store paths, signatures,
persistence, or deployment state.

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
explicit bounded store snapshot, accepted analysis, and exact selection derive
one canonical content-addressed manifest while preserving store custody,
caller-declared edge authority, caller-selected artifact policy, and the
distinction between assembly and execution. The semantics of 0019, 0027, 0030,
and the process-local 0032 bytecode graph remain unchanged.
