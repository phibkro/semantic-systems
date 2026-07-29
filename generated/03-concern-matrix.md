# Concern matrix

<!-- Generated. Edit model sources, not this file. -->

Dense rows suggest overloaded components; dense columns reveal cross-cutting concerns.

| Component | artifact generation | assumption recording | commit publication | compatibility | continuations | discovery | distribution | effect handling | effect typing | evaluation | evaluation semantics | event publication | evidence policy | external effect ownership | integration | language semantics | mailbox scheduling | message dispatch | model validation | obligation generation | package identity | project architecture | proof checking | realization selection | retry scheduling | runtime execution | state ownership | transaction isolation | type inference | usage checking | view generation | work scheduling |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Actor runtime |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | ● |  |  |  |  |  |  |  |  |  | ● |  |  |  |  |  |
| Commit outbox |  |  |  |  |  |  |  |  |  |  |  | ● |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| Compiler | ● | ● |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | ● |  |  |  |  |  |  |  |  |
| Effect runtime |  |  |  |  | ● |  |  | ● |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| Executable examples |  |  |  |  |  |  |  |  |  | ● |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| Inventory actor instance |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | ● |  |  |  |  |  |  |  |  | ● |  |  |  |  |  |
| Inventory event handler |  |  |  |  |  |  |  |  |  |  |  | ● |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| Inventory tracer bullet |  |  |  |  |  |  |  |  |  | ● |  |  |  |  | ● |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| Inventory transactional store |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | ● |  |  |  |  |
| Language system |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | ● |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| Package ecosystem |  |  |  | ● |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | ● |  |  |  |  |  |  |  |  |  |  |  |
| Payment actor |  |  |  |  |  |  |  |  |  |  |  |  |  | ● |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| Project graph tooling |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | ● |  |  |  |  |  |  |  |  |  |  |  | ● | ● |
| Realization resolver |  | ● |  |  |  |  |  |  |  |  |  |  | ● |  |  |  |  |  |  |  |  |  |  | ● |  |  |  |  |  |  |  |  |
| Registry |  |  |  |  |  | ● | ● |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| Runtime system |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | ● |  |  |  |  |  |  |
| STM runtime |  |  | ● |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | ● |  |  | ● |  |  |  |  |
| Semantic systems project |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | ● |  |  |  |  |  |  |  |  |  |  |
| Surface elaborator |  |  |  |  |  |  |  |  | ● |  |  |  |  |  |  |  |  |  |  | ● |  |  |  |  |  |  |  |  | ● | ● |  |  |
| Trusted kernel |  |  |  |  |  |  |  |  | ● |  | ● |  |  |  |  |  |  |  |  |  |  |  | ● |  |  |  |  |  |  | ● |  |  |
