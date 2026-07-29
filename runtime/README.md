# Runtime

The runtime should remain decomposable into packages rather than becoming a
monolith.

Planned domains:

- allocation and ownership support;
- effect handlers and resumptions;
- deterministic actor simulation;
- production actor scheduling;
- STM TVars, logs, validation, retry, and commit;
- event outbox dispatch;
- native and WebAssembly target support.

The project begins with deterministic implementations that serve as semantic
oracles before optimization.
