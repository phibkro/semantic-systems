# Relational fact export tracer

Feature 0034 projects one validated canonical project graph into immutable,
storage-independent JSON facts. Every fact points back to its exact
`model/**/*.json` source document and remains explicitly non-authoritative.

The executable tracer in `tests/project-relational-facts.test.ts` demonstrates:

1. canonical export and independent byte validation;
2. a cyclic dependency impact query with deterministic shortest paths;
3. a claim-to-obligation-to-evidence explanation path;
4. an explicit assumption path; and
5. bounded depth and node-limit outcomes.

Run it with:

```bash
bun test tests/project-relational-facts.test.ts
```
