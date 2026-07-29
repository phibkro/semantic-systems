# Delegation frontier

<!-- Generated. Edit model sources, not this file. -->

Ready parallel work items: **3**.

| Work item | Phase | Status | Ready | Score | Recommendation | Blockers |
|---|---|---|---:|---:|---|---|
| Implement minimal actor runtime | implementation | planned | yes | 75 | delegate with review |  |
| Implement core checker | implementation | planned | no | 65 | delegate with review | Specify minimal kernel calculus |
| Implement inventory actor realization | implementation | planned | no | 94 | delegate directly | Implement minimal actor runtime, Complete inventory domain contract |
| Complete inventory domain contract | design | ready | yes | 82 | delegate with review |  |
| Prove inventory invariant | validation | planned | no | 94 | delegate with review | Complete inventory domain contract |
| Implement pure inventory realization | implementation | planned | no | 97 | delegate directly | Complete inventory domain contract |
| Implement inventory STM realization | implementation | planned | no | 94 | delegate directly | Complete inventory domain contract, Implement minimal STM runtime |
| Specify minimal kernel calculus | research | ready | yes | 53 | bounded spike |  |
| Implement package and evidence resolver | implementation | planned | no | 72 | delegate with review | Define normalized theory identity |
| Specify STM effect and handler laws | research | planned | no | 49 | bounded spike | STM is a library effect |
| Model-check STM interleavings | validation | planned | no | 94 | delegate with review | Implement minimal STM runtime |
| Implement minimal STM runtime | implementation | planned | no | 68 | delegate with review | Specify STM effect and handler laws |
| Define normalized theory identity | design | planned | no | 41 | bounded spike | Laws participate in semantic identity |
