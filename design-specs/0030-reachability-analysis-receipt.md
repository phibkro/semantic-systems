# Design spec 0030: declared reachability analysis receipt

Status: frozen for one bounded cross-value reachability journey

Date: 2026-08-01

Depends-On-Feature-IDs: 0027-semantic-artifact-store

Design-Lens-Version: open-semantic-system-v1

## Problem

Feature 0027 stores accepted semantic values, but version 1 normalized-core
artifacts contain one checked program rather than a package or declaration
graph. The store therefore cannot observe cross-value runtime dependencies.
Inferring edges from authored names, imported-assumption prose, source
correspondence, or digest similarity would invent semantic facts.

The next tracer needs the smallest honest reachability boundary. A caller can
declare one closed bounded dependency graph whose nodes are present in one
store snapshot. The analyzer can then warrant the exact graph closure from one
explicit root while keeping the declaration of each edge visibly outside its
authority.

## Felt journey

A caller stores semantic values A, B, and C. It supplies duplicate-free JSON
whose closed node set selects those three values from the store snapshot and
whose runtime edge is A to B. Analysis from root A returns A and B as reachable
and C as unreachable. Reordering node and dependency arrays produces the same
graph and receipt identities. Stored values outside that selected node set are
outside the receipt universe.

An absent root, absent subject, foreign endpoint, duplicate edge, excess field,
over-limit graph, malformed JSON, or changing store projection returns a typed
failure and no receipt. A cycle is valid and terminates through a visited set.

## Open semantic system design lens

### Boundary and warranted state

Feature 0030 owns strict JSON decoding, one captured semantic-store projection,
exact node coverage, endpoint validation, bounded graph traversal, canonical
ordering, and domain-separated graph and receipt identities.

The receipt warrants only these claims:

- every declared node was present in the one captured 0027 store snapshot;
- the normalized graph is the exact closed graph supplied by the caller;
- `reachable` is the transitive closure of declared runtime edges from the
  declared root;
- `unreachable` is the complement within that captured node set; and
- the graph and receipt identities bind the exact normalized payloads below.

The analyzer does not warrant that a declared edge reflects program semantics.
Only a future compiler dependency extractor can produce that stronger fact.

### Semantic inputs

`analyzeJson(unknown)` accepts only a primitive JSON string. Its decoded value
is exactly:

```text
{
  "format": "semantic.declared-dependency-graph",
  "version": 1,
  "root_semantic_identity": Identity,
  "nodes": [
    {
      "semantic_identity": Identity,
      "runtime_dependencies": [Identity...]
    }...
  ]
}
```

An edge points from a semantic value to the runtime semantic values it
requires. Node order and dependency order are presentation only. All records
are closed. Duplicate JSON keys, nodes, or dependencies reject.

### Semantic outputs

Successful analysis returns a deeply immutable receipt and its canonical UTF-8
bytes. The receipt is exactly:

```text
{
  "format": "semantic.reachability-receipt",
  "version": 1,
  "status": "analyzed",
  "procedure_identity": "semantic.language-build/reachability/0030/v1",
  "edge_authority": "caller-declared",
  "graph": {
    "format": "semantic.runtime-dependency-graph",
    "version": 1,
    "graph_identity": Identity,
    "nodes": [
      {
        "semantic_identity": Identity,
        "runtime_dependencies": [Identity...]
      }...
    ]
  },
  "root_semantic_identity": Identity,
  "reachable_semantic_identities": [Identity...],
  "unreachable_semantic_identities": [Identity...],
  "node_count": Integer,
  "edge_count": Integer,
  "receipt_identity": Identity
}
```

Identity arrays and graph nodes use ascending UTF-16 code-unit order. The graph
identity binds the normalized graph without a root, so several roots can reuse
it. The receipt identity binds the procedure, declared edge authority, complete
graph, root, both fact sets, and counts. Canonical bytes contain the exact
receipt JSON followed by one line feed.

`validateReceiptBytes(unknown)` strictly decodes those bytes, recomputes both
identities and the closure, checks every graph subject against one store
snapshot, and returns the same immutable receipt. It cannot strengthen the
authority of the declared edges.

### Effect protocols and uncertainty

Each public operation reads `SemanticStore.snapshot` once, then performs total
bounded normalization and traversal over that immutable projection.
`Crypto.Crypto` owns both SHA-256 observations. Digest failure remains typed.
Analysis never mutates the store and owns no `Ref`.

Concurrent inserts or replay after the captured snapshot affect only later
requests. The receipt makes no claim about later store state.

### Components and orthogonal structures

```text
declared graph JSON -> strict decoder -> normalized declared graph
SemanticStore       -> one snapshot  -> semantic identity membership
normalized graph + membership        -> bounded transitive closure
normalized graph + closure + Crypto  -> graph and analysis receipt artifact
receipt bytes       -> strict decoder -> recomputed and revalidated receipt
```

Store custody, edge declaration, graph traversal, and digest observation are
separate components. Authored names and exact artifact variants do not enter
reachability.

### Bounded autonomy and resources

- maximum JSON input: 1,048,576 UTF-8 bytes;
- maximum JSON nesting depth: 64;
- maximum JSON values: 16,384;
- maximum nodes: 1,024, matching the 0027 semantic-value bound;
- maximum total runtime edges: 4,096; and
- traversal is iterative and visits each admitted node and edge at most once.

The scanner can bound its own traversal after receiving the primitive string.
Runtime spent inside host string encoding, Schema, Crypto, or caller scheduling
remains an observed effect rather than a termination proof.

### Evidence, assumptions, and unsupported claims

Executable examples and generated graph families establish exact closure,
permutation invariance, cycle termination, complement partitioning, bounded
rejection, typed digest failure, and deep immutability. They do not establish
that caller-declared edges are semantically true, that all runtime dependencies
were extracted, or that unreachable values can be removed.

The contract assumes the accepted 0027 snapshot contains only identities
warranted by 0019. It consumes membership in that store observation; it does
not require every stored semantic value to enter the declared graph and does
not revalidate artifact bytes.

## Executable contract

```text
analyzeJson(input)
  -> require primitive bounded JSON text
  -> reject duplicate keys and malformed or excess structure
  -> capture one SemanticStore snapshot
  -> require every graph subject to be present in the store snapshot
  -> require root and dependency endpoints to be present graph nodes
  -> normalize nodes and edges
  -> derive graph identity
  -> traverse declared runtime edges from root
  -> derive immutable reachability receipt, receipt identity, and canonical bytes
```

Graph identity domain:

```text
semantic.language-build/runtime-dependency-graph/v1
```

Receipt identity domain:

```text
semantic.language-build/reachability-receipt/v1
```

Each digest preimage is UTF-8 domain bytes, one zero byte, and canonical JSON
bytes for the exact normalized payload. No other projection is permitted.

## Counterexamples

1. Authored names are not dependency edges.
2. Imported-assumption strings are not dependency edges.
3. A stored value omitted from the declared graph is outside the receipt
   universe, not unreachable.
4. A graph with a foreign node or endpoint has no store custody.
5. Duplicate edges cannot silently normalize into one edge.
6. A cycle does not imply nontermination of the finite traversal.
7. A closure over declared edges does not warrant dead-code removal.
8. Changing only array order cannot change graph or receipt identity.
9. Changing root can preserve graph identity but must change receipt identity.
10. Digest failure cannot return an identity-shaped placeholder.

## Acceptance

Feature 0030 is accepted when one clean head:

1. exposes the exact JSON request and receipt shapes above;
2. consumes one 0027 store snapshot and requires every declared subject to be
   present;
3. rejects malformed, duplicate, foreign, and over-limit inputs through typed
   failures;
4. computes exact finite closure and complement for chains, branches, islands,
   and cycles;
5. proves permutation-invariant graph and receipt identities;
6. keeps graph identity independent of root and receipt identity dependent on
   root;
7. emits canonical receipt bytes and revalidates them through an independent
   strict public boundary;
8. keeps caller declarations, store state, and returned receipts unaliased and
   immutable;
9. preserves digest failure as an explicit Effect failure; and
10. passes focused Bun tests, TypeScript 7 with Effect diagnostics, Oxlint,
    Oxfmt, project-model checks, genuine Node parity where applicable, and the
    complete repository gate.

The exact local command is:

```bash
bun scripts/accept/0030-reachability-analysis-receipt.ts
```

## Non-goals

- Inferring dependencies from normalized-core terms, assumptions, source data,
  names, or identities.
- Claiming that declared dependencies are complete or semantically true.
- Removing unreachable values or producing a runtime semantic value.
- Effect analysis, zero-use analysis, rewrite proposals, optimization receipts,
  garbage collection, persistence, remote caching, modules, or packages.
- Mutating, pinning, or locking the semantic store during analysis.

## Semantic diff

The language-build layer gains its first explicit analysis receipt. It can
answer a bounded, content-addressed reachability query over one captured store
projection without confusing a caller declaration with compiler-derived
semantic evidence. This is the honest prerequisite for later dependency
extraction and dead-code rewrite contracts.
