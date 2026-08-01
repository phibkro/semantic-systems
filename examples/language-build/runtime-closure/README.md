# Semantic runtime closure

Feature 0033 joins three explicit inputs:

1. a name-free `semantic.language-build-store` snapshot;
2. canonical `semantic.reachability-receipt` bytes; and
3. a `semantic.runtime-artifact-selection` JSON string.

The caller owns the declared dependency edges and the artifact choice. The
module owns bounded snapshot replay, receipt revalidation, exact selection
coverage, canonical ordering, and manifest identity.

```ts
const closure =
  yield *
  buildRuntimeClosure(
    storeSnapshot,
    reachability.bytes,
    JSON.stringify({
      format: "semantic.runtime-artifact-selection",
      version: 1,
      members: [
        {
          semantic_identity: stored.semantic_identity,
          artifact_identity: stored.artifact_identity,
        },
      ],
    }),
  );

const validated = yield * validateRuntimeClosureBytes(storeSnapshot, closure.bytes);
```

Both operations require only `Crypto.Crypto`. They create a fresh private
semantic store to validate the explicit snapshot. The manifest records an
assembled compiler-to-build input closure. It does not execute or deploy it.

The complete executable journey and its rejection cases are in
`tests/language-build-runtime-closure.test.ts`. Genuine Node parity is in
`tests/language-build-runtime-closure-node.test.ts`.
