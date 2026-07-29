# Model documents

Each JSON file has:

```json
{
  "entities": [],
  "relations": []
}
```

IDs are global. Relations may cross files. Keep semantic, architecture,
evidence, work, execution, and runtime documents separate.

The validator checks kinds, references, containment cycles, hard work cycles,
work acceptance and delegation metadata, evidence categories, and unsupported
claims.
