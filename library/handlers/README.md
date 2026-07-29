# Handler Packages

Handlers interpret abstract effect theories. Their manifests state which laws,
safety properties, retry properties, and resource constraints they provide.

Initial handlers:

- pure fresh identifiers for simulation;
- actor message dispatch;
- STM transaction interpretation;
- event collection;
- durable commit outbox.
