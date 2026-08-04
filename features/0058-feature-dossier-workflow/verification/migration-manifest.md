---
format: semantic.feature-artifact/v1
feature_id: 0058-feature-dossier-workflow
kind: verification
evidence_categories: [analysis]
unsupported_claims:
  - Migration inspection does not establish runtime, proof, review, merge, provider, or closure evidence.
---
# 0058 migration manifest

This manifest records the atomic cutover from the legacy authored lifecycle roots. SHA-256 values are over the exact pre-cutover bytes. Model JSON maps to the generated projection; its source custody remains in the feature transition receipt.

| Before | After | SHA-256 | Historical status |
| --- | --- | --- | --- |
| `design-specs/0001-inventory-resolution-tracer.md` | `features/0001-inventory-resolution-tracer/spec.md` | `811f750a44f78ec73124a5c00503c1033f84c3dfc9e6cb45e979bc3006a61b0d` | `complete` |
| `design-specs/0002-reference-baselines-deep-research.md` | `features/0002-reference-baselines-deep-research/spec.md` | `3f8f198af5bc0d7994567a1916f688f5bf712460fbea7c3f358c79d1af5bdb8f` | `complete` |
| `design-specs/0003-independent-resolution-checker.md` | `features/0003-independent-resolution-checker/spec.md` | `0d739cea7b1e2c803c7d02266c0320bfa086ab68f2ba1cb13e9dfb81d9c8e2d8` | `blocked` |
| `design-specs/0004-reference-source-custody.md` | `features/0004-reference-source-custody/spec.md` | `affab6784a043215f9ac1d90ac9264f2f534738d374910bebdf0fc0d5c12583c` | `complete` |
| `design-specs/0005-autonomous-development-control-loop.md` | `features/0005-autonomous-development-control-loop/spec.md` | `8fd13131c4bf6fa9e8445130769df75c091a41d1a070064d60039794b6a06baa` | `in_progress` |
| `design-specs/0007-reuse-first-engineering.md` | `features/0007-reuse-first-engineering/spec.md` | `20838a0a0d4673f380fbd529e0cb2eae27d9106aa141a38ac87bb4c6abc5c422` | `blocked` |
| `design-specs/0010-typescript-effect-v4-runtime.md` | `features/0010-typescript-effect-v4-runtime/spec.md` | `0fbfd6f4afb7136aff25fbe3be4f2397b17bc5244ef1a11fa1ee2035735ae16d` | `complete` |
| `design-specs/0011-effect-v4-oxlint-domains.md` | `features/0011-effect-v4-oxlint-domains/spec.md` | `7d546f220e567c21393afe51456b099a74d6343ea4d6be8b8503185f5df65645` | `unknown` |
| `design-specs/0012-minimal-actor-runtime.md` | `features/0012-minimal-actor-runtime/spec.md` | `46c44a2c6837f244a834d672700b7a0d6993140bafbab6f2e2db9117fad96176` | `complete` |
| `design-specs/0013-bounded-actor-trace-retention.md` | `features/0013-bounded-actor-trace-retention/spec.md` | `4a477387362c8f1d5ae0a3240c972b57f3716564511c2c8e282de2073516a850` | `complete` |
| `design-specs/0014-stm-effect-handler-laws.md` | `features/0014-stm-effect-handler-laws/spec.md` | `5ce3109f93e94c40a7712e3746a8bf81d1b7493d47bd7d3259ed5c1f14ba5c6f` | `complete` |
| `design-specs/0015-open-semantic-system-design-lens.md` | `features/0015-open-semantic-system-design-lens/spec.md` | `d89124a8b58a45bd94f172bac9a65f528b8be8f43c05956875e44d8cd4b59f29` | `complete` |
| `design-specs/0016-executable-semantic-system-kernel.md` | `features/0016-executable-semantic-system-kernel/spec.md` | `91ee560503992853fa49767294cc8fe0ac10ffeb7227aa0802166bbd3c8a1a9a` | `complete` |
| `design-specs/0017-control-room-reconstruction.md` | `features/0017-control-room-reconstruction/spec.md` | `0555adefaa1be77c0a8732addb64af5312fc0c717b513846629dca8dbf27101d` | `complete` |
| `design-specs/0018-minimal-kernel-calculus.md` | `features/0018-minimal-kernel-calculus/spec.md` | `54d5b956c73afecb314ca724cbdecf3c0a0c506593eed902c88cf1603ff833c9` | `complete` |
| `design-specs/0019-normalized-core-format.md` | `features/0019-normalized-core-format/spec.md` | `ccf7df4922e624605605fafd645583d60d8352651128b60fddcc0bacacf731e4` | `complete` |
| `design-specs/0020-agent-facing-kernel-json.md` | `features/0020-agent-facing-kernel-json/spec.md` | `8182af5521969682bdb81dae570bc3281a82a563671a7a55aa0995f261a4b3fd` | `complete` |
| `design-specs/0020-lossless-kernel-source.md` | `features/0020-lossless-kernel-source/spec.md` | `8baf918e9d16f327f7517ba81b528c7ce2ce5d5f4b6619cb064e32559ef6125d` | `superseded` |
| `design-specs/0021-pbk-portfolio-control-room.md` | `features/0021-pbk-portfolio-control-room/spec.md` | `eb57e166c030354ef19f9c5fc16cf830a5b7b5d875cd2d3b8e71bedb62d6b03a` | `complete` |
| `design-specs/0022-kernel-reference-interpreter.md` | `features/0022-kernel-reference-interpreter/spec.md` | `2b2147d8d3363acbe3a54dd90fb10afd7b54dfe3a7f97e56b5e8c52281e50987` | `complete` |
| `design-specs/0031-control-room-interactive-skill-tree.md` | `features/0031-control-room-interactive-skill-tree/spec.md` | `bebdbc451a02169dc6d8a9bb9c560cc664aa366c227cc65d37128e8acd1f7c85` | `complete` |
| `design-specs/0046-effect-graph-execution-index.md` | `features/0046-effect-graph-execution-index/spec.md` | `f21b556d89d49ee8fdf8c636e7d96e342e651ef46421a852a9b6a8247003eaff` | `complete` |
| `design-specs/0048-pbk-control-room-acceptance-reconciliation.md` | `features/0048-pbk-control-room-acceptance-reconciliation/spec.md` | `029adbdc779a14a064cdb24901ce24440c94ffd33297b6fa14957dc4c2639540` | `complete` |
| `design-specs/0049-canonical-work-lifecycle.md` | `features/0049-canonical-work-lifecycle/spec.md` | `1bf90709522e5e700c5d50d661e473b4affd9ef3a27d60cfdc8340473c8257b9` | `superseded` |
| `design-specs/0050-bounded-stm-runtime.md` | `features/0050-bounded-stm-runtime/spec.md` | `3ecac12eafcd4ee093b359486ff7125c9289abc3638b1c93e83e0d7f2b8ed2e5` | `complete` |
| `design-specs/0051-kernel-finite-sums.md` | `features/0051-kernel-finite-sums/spec.md` | `513d586497cee35208db8fb2654e4a6e117b2d6507c283c33a208e38d9486efb` | `complete` |
| `design-specs/0052-stm-schedule-explorer.md` | `features/0052-stm-schedule-explorer/spec.md` | `9f09e35147ed991d491c09d4599cd206e3e354782c92831a1645165931b34533` | `complete` |
| `design-specs/0053-relational-fact-export.md` | `features/0053-relational-fact-export/spec.md` | `64c89db71bb85bbafddf078441f8e8c7d0898e9cc1ad561c0b4c5f0a3704e72b` | `complete` |
| `design-specs/0054-semantic-contract-wit-mapping.md` | `features/0054-semantic-contract-wit-mapping/spec.md` | `6cb478158bd868f647d64dbf6a8c27b4d2fb890882491ceaff5585ef434fe9c2` | `complete` |
| `design-specs/0055-lifecycle-plan-layout.md` | `features/0055-lifecycle-plan-layout/spec.md` | `9c9d7a6b359f0f5c63555390e1a36d2c9c493f3a0dab88b39c2a495541969abc` | `complete` |
| `design-specs/0056-project-json-language-tooling.md` | `features/0056-project-json-language-tooling/spec.md` | `935419f5fb20813a66e8f65653e2d2cebd2073032e8ef97dad5980e5f7cba575` | `complete` |
| `design-specs/0057-control-room-agent-observation-correlation.md` | `features/0057-control-room-agent-observation-correlation/spec.md` | `66427cadd4ea6c0ed5989cdc594fddfbc5c466676ab8a068747f15bbaea39ab3` | `complete` |
| `design-specs/0058-feature-dossier-workflow.md` | `features/0058-feature-dossier-workflow/spec.md` | `4ef45c878243d9cc5126ae1a0c542183c88dfeaed767973f666b90909169647c` | `in_progress` |
| `model/work/features/0001-inventory-resolution-tracer.json` | `generated/project-model/work-features.json#0001-inventory-resolution-tracer` | `f73965826016e0cafbc859a22c364a460870d9a442e8ef10fdf080a7469e97f1` | `complete` |
| `model/work/features/0002-reference-baselines-deep-research.json` | `generated/project-model/work-features.json#0002-reference-baselines-deep-research` | `cdd8c6ebdeddc56893779755051fbc9f8d45a0a98533408b59f1a2b539746894` | `complete` |
| `model/work/features/0003-independent-resolution-checker.json` | `generated/project-model/work-features.json#0003-independent-resolution-checker` | `fb15d7fbb38da621f351b1f1cb3e49e63c322d0869c135f0e576ab5618376040` | `blocked` |
| `model/work/features/0004-reference-source-custody.json` | `generated/project-model/work-features.json#0004-reference-source-custody` | `e7392d76c5594d0cdf9541200fb31cf5e0aec0873b413fb0f5d52ff31bb70580` | `complete` |
| `model/work/features/0005-autonomous-development-control-loop.json` | `generated/project-model/work-features.json#0005-autonomous-development-control-loop` | `c6176a320975a56560a9c99cecfa0c2aae9fa33e208232cdc3140dd75a022fa0` | `in_progress` |
| `model/work/features/0007-reuse-first-engineering.json` | `generated/project-model/work-features.json#0007-reuse-first-engineering` | `888eb3bd0b9a3ac8312fafe0816477347739858d0468afab6703df159e93b502` | `blocked` |
| `model/work/features/0010-typescript-effect-v4-runtime.json` | `generated/project-model/work-features.json#0010-typescript-effect-v4-runtime` | `94890179bb8b73defeb3944aa18d8b53000d2feff32c76feedc65982a9426777` | `complete` |
| `model/work/features/0012-minimal-actor-runtime.json` | `generated/project-model/work-features.json#0012-minimal-actor-runtime` | `20517a275c3e08fa6e85d46cd953af221ac9d973451b1c1b463091e4c1109550` | `complete` |
| `model/work/features/0013-bounded-actor-trace-retention.json` | `generated/project-model/work-features.json#0013-bounded-actor-trace-retention` | `416f495d997369d23d36ea1b48ddf3f30bdba3d237c5c5707bd5947c5ed2baf9` | `complete` |
| `model/work/features/0014-stm-effect-handler-laws.json` | `generated/project-model/work-features.json#0014-stm-effect-handler-laws` | `89ed0748e2e60ad8de740bbdf9c3c2b2f1e866ec4d32a101e7de98a6938050c0` | `complete` |
| `model/work/features/0015-open-semantic-system-design-lens.json` | `generated/project-model/work-features.json#0015-open-semantic-system-design-lens` | `a3acb96b285cc1c7964d638aebabc30ffef5634d55bba4e489ecefc8d5527281` | `complete` |
| `model/work/features/0016-executable-semantic-system-kernel.json` | `generated/project-model/work-features.json#0016-executable-semantic-system-kernel` | `4f8b8e1b9f0aedd151da0a84eee6f72957088a412a1400351708080bff5b2dc3` | `complete` |
| `model/work/features/0017-control-room-reconstruction.json` | `generated/project-model/work-features.json#0017-control-room-reconstruction` | `2f1a2e69d90ded1e7e779f14b306f5fac3ffcfe874825bf59aa8770a7585c76b` | `complete` |
| `model/work/features/0018-minimal-kernel-calculus.json` | `generated/project-model/work-features.json#0018-minimal-kernel-calculus` | `df2af278735574b0df45d52a23cb16280dde018f91b55fc9cb9e1148cdd032d9` | `complete` |
| `model/work/features/0019-normalized-core-format.json` | `generated/project-model/work-features.json#0019-normalized-core-format` | `94e970575970db8d29e8ad6b62ebff4eb3e8fe91758f149bff7b399b74304df0` | `complete` |
| `model/work/features/0020-agent-facing-kernel-json.json` | `generated/project-model/work-features.json#0020-agent-facing-kernel-json` | `289449dff8025d6f934eb13337b8016cd215a896841cf17ef6454aaa08f08f28` | `complete` |
| `model/work/features/0020-lossless-kernel-source.json` | `generated/project-model/work-features.json#0020-lossless-kernel-source` | `eaf18b26ea4d38d734c5520dcc07b796ba7ccd629432d6f37fc08024a72b195a` | `superseded` |
| `model/work/features/0021-pbk-portfolio-control-room.json` | `generated/project-model/work-features.json#0021-pbk-portfolio-control-room` | `65232aa7dc7147481a8074dbfacb4f3b3583a90a7e5e702ce0435dcc5922daee` | `complete` |
| `model/work/features/0022-kernel-reference-interpreter.json` | `generated/project-model/work-features.json#0022-kernel-reference-interpreter` | `b9b437fc077e615de8f60da718ae750fe8373d34fb45ab3e7c4136a72a454ffa` | `complete` |
| `model/work/features/0031-control-room-interactive-skill-tree.json` | `generated/project-model/work-features.json#0031-control-room-interactive-skill-tree` | `815b17669efe83ff36d805cf8f6539b047c1f40f234693a196c01907f4fe2797` | `complete` |
| `model/work/features/0046-effect-graph-execution-index.json` | `generated/project-model/work-features.json#0046-effect-graph-execution-index` | `58942e1d571dc03e45756a2de8fb875002eca6119281635fd6ce0a2ef00e7a80` | `complete` |
| `model/work/features/0048-pbk-control-room-acceptance-reconciliation.json` | `generated/project-model/work-features.json#0048-pbk-control-room-acceptance-reconciliation` | `63e09460c695058c0ce266d472243de3198f2f670885488541bed438177e9fc2` | `complete` |
| `model/work/features/0049-canonical-work-lifecycle.json` | `generated/project-model/work-features.json#0049-canonical-work-lifecycle` | `e1c0210b39701c3ad4b92ff8f613645671f1be2add230cb66563aca7f0000a2d` | `superseded` |
| `model/work/features/0050-bounded-stm-runtime.json` | `generated/project-model/work-features.json#0050-bounded-stm-runtime` | `f6229507432094fd50ef453fe5f52cd0ddb753560e2ec6e6f74bc7b39889780f` | `complete` |
| `model/work/features/0051-kernel-finite-sums.json` | `generated/project-model/work-features.json#0051-kernel-finite-sums` | `7a9fa4d8cdd56e193f07d4603c2e5c03d34f041f41e8b82475e254928ce8756c` | `complete` |
| `model/work/features/0052-stm-schedule-explorer.json` | `generated/project-model/work-features.json#0052-stm-schedule-explorer` | `9c56a118759ce85093f1abbc25d3f16e860f8c38c3cc25a74b01f7391a11f292` | `complete` |
| `model/work/features/0053-relational-fact-export.json` | `generated/project-model/work-features.json#0053-relational-fact-export` | `18b39deb56456d731d7f3f9e588940a1349d4a588e965616a28fdabbc82a8022` | `complete` |
| `model/work/features/0054-semantic-contract-wit-mapping.json` | `generated/project-model/work-features.json#0054-semantic-contract-wit-mapping` | `7e86377e2f454302d87b4318d4fad3b567151123cc4f7abd716cda7d1425dc43` | `complete` |
| `model/work/features/0055-lifecycle-plan-layout.json` | `generated/project-model/work-features.json#0055-lifecycle-plan-layout` | `11a56c155cd5dc76cd90e6f391ad25d3750129ddcaff8d7fa137185201e5a191` | `complete` |
| `model/work/features/0056-project-json-language-tooling.json` | `generated/project-model/work-features.json#0056-project-json-language-tooling` | `46585c8af3e4ae19787b12d1d205c7e44f833f2d461050a6a70a18d6ad169caf` | `complete` |
| `model/work/features/0057-control-room-agent-observation-correlation.json` | `generated/project-model/work-features.json#0057-control-room-agent-observation-correlation` | `6d1a4e4c92236101c5b83aa1ad6812cefc5c27fb636698f718db29d9306df673` | `complete` |
| `model/work/features/0058-feature-dossier-workflow.json` | `generated/project-model/work-features.json#0058-feature-dossier-workflow` | `50ee26712da8298e085ad96b4e2382a5a404bf73f6ca800f335dca697cc46f13` | `in_progress` |
| `plans/active/0003-independent-resolution-checker.md` | `features/0003-independent-resolution-checker/plan.md` | `f33f128a09d1638c85cb856e672ef17c67221d104b486f1adbf8411e961b32f6` | `blocked` |
| `plans/active/0005-autonomous-development-control-loop.md` | `features/0005-autonomous-development-control-loop/plan.md` | `39ac9c565c18083f6b75308a29ba25eb721183059a52cc2815ee8ea119d5fd49` | `in_progress` |
| `plans/active/0007-reuse-first-engineering.md` | `features/0007-reuse-first-engineering/plan.md` | `ef21fdd7ee97be4a9a07a02c98651c9a7ea972627b6d8c178f62174eae8de917` | `blocked` |
| `plans/active/0058-feature-dossier-workflow.md` | `features/0058-feature-dossier-workflow/plan.md` | `ee44451a32d0a9d722bffb04e370dda86c110db64d7fd4b5c1d012322441d209` | `in_progress` |
| `plans/completed/0001-inventory-resolution-tracer.md` | `features/0001-inventory-resolution-tracer/plan.md` | `da074f6d15639be7d53335221ed72c96091af4df2b9a6db13d0a42de89bdebe9` | `complete` |
| `plans/completed/0002-reference-baselines-deep-research.md` | `features/0002-reference-baselines-deep-research/plan.md` | `d4456af31c6c493cdc6b753f1411965f4dae00bdd079e2fcc479723d569ff98a` | `complete` |
| `plans/completed/0004-reference-source-custody.md` | `features/0004-reference-source-custody/plan.md` | `26610057ce6bf1136865d33341e323338589a51b076ed0be6de726aecf1e2d07` | `complete` |
| `plans/completed/0010-typescript-effect-v4-runtime.md` | `features/0010-typescript-effect-v4-runtime/plan.md` | `48dd4bcdb15534e3eacd6de8290c2d59c27339a2366c68ea1e5ebca43ea0b133` | `complete` |
| `plans/completed/0012-minimal-actor-runtime.md` | `features/0012-minimal-actor-runtime/plan.md` | `f230221fc4888bab03c2b32cbc90174586c4b382b6f019eaae75145cdbcbb57a` | `complete` |
| `plans/completed/0013-bounded-actor-trace-retention.md` | `features/0013-bounded-actor-trace-retention/plan.md` | `e731e31db56b5251b20566db111edff3e5525fae6d286270410c5b1d2fbe4eb9` | `complete` |
| `plans/completed/0014-stm-effect-handler-laws.md` | `features/0014-stm-effect-handler-laws/plan.md` | `4bd9cb8e06203126b9d7d06bd397f51108afef122b0291d7db959e3ab5c203a7` | `complete` |
| `plans/completed/0015-open-semantic-system-design-lens.md` | `features/0015-open-semantic-system-design-lens/plan.md` | `5e0bfa8d2e0ca15ffb3282dd1c653b424d4eef2dda6eb0b177317471d38dfcee` | `complete` |
| `plans/completed/0016-executable-semantic-system-kernel.md` | `features/0016-executable-semantic-system-kernel/plan.md` | `b1a9807c43952e92191ad232dd7668256747ba25e7c3fea05e9a876d160bbf45` | `complete` |
| `plans/completed/0017-control-room-reconstruction.md` | `features/0017-control-room-reconstruction/plan.md` | `b23b0874fc29b7d67ca9c36c682af148155f86a7846de8a7408456b8db78fe30` | `complete` |
| `plans/completed/0018-minimal-kernel-calculus.md` | `features/0018-minimal-kernel-calculus/plan.md` | `3ff02510df2058a2a875e208615936712d6d4cd44d6a0e86ed0882cc89cdfa44` | `complete` |
| `plans/completed/0019-normalized-core-format.md` | `features/0019-normalized-core-format/plan.md` | `14b2861001e9967ab6be6a46a41cdc7be759ed0d33a46d0e452a9c117d00d952` | `complete` |
| `plans/completed/0020-agent-facing-kernel-json.md` | `features/0020-agent-facing-kernel-json/plan.md` | `558992e811922fdce25286fbcef0d23ff3fa9a7bb5169df1cd950817b0221b7b` | `complete` |
| `plans/completed/0021-pbk-portfolio-control-room.md` | `features/0021-pbk-portfolio-control-room/plan.md` | `5f64605223965a853fa0d06cd56d6d4351ea7d9c6139276d5735b8e6c99c2bb5` | `complete` |
| `plans/completed/0022-kernel-reference-interpreter.md` | `features/0022-kernel-reference-interpreter/plan.md` | `acd1619f17736d7e972764422c6daf398cfbb322d193413d53b6e6e146ca98e2` | `complete` |
| `plans/completed/0031-control-room-interactive-skill-tree.md` | `features/0031-control-room-interactive-skill-tree/plan.md` | `ff355b9c2dba12b4e7dfa3e9bf51183cb4f224271880e70c393311d9343036e4` | `complete` |
| `plans/completed/0046-effect-graph-execution-index.md` | `features/0046-effect-graph-execution-index/plan.md` | `b27fc96a240198e366df9f6b4eaf2c1838059772f710368c759f31dc7b88023f` | `complete` |
| `plans/completed/0048-pbk-control-room-acceptance-reconciliation.md` | `features/0048-pbk-control-room-acceptance-reconciliation/plan.md` | `07ed7599019a723c2b54c7042a498eedc2c30d01b0d4289d50d9454430acc6f6` | `complete` |
| `plans/completed/0050-bounded-stm-runtime.md` | `features/0050-bounded-stm-runtime/plan.md` | `cda4885fba57f6a915c5a7b797efc8921ac513c58d401c0a875c23f473cc2012` | `complete` |
| `plans/completed/0051-kernel-finite-sums.md` | `features/0051-kernel-finite-sums/plan.md` | `6ccbf9e7673197c714ee9b6f398fb02d7307c6a5b66d2f8efbc0f35c05ab232c` | `complete` |
| `plans/completed/0052-stm-schedule-explorer.md` | `features/0052-stm-schedule-explorer/plan.md` | `fe3b25fe32547321c51d245b2dafd1b10408c1b7204dd6c42909003456b18553` | `complete` |
| `plans/completed/0053-relational-fact-export.md` | `features/0053-relational-fact-export/plan.md` | `1205d01c74841879c39d4f7890bd6b15ac14cb5793f607d856e460b7d70c3a88` | `complete` |
| `plans/completed/0054-semantic-contract-wit-mapping.md` | `features/0054-semantic-contract-wit-mapping/plan.md` | `3ebe1808d594c1682c1904384872c5b181ca4694113fe43cfb9ffb4c27b65186` | `complete` |
| `plans/completed/0055-lifecycle-plan-layout.md` | `features/0055-lifecycle-plan-layout/plan.md` | `56f6a9df52d1195b9d4acc0571497b3667e15f84f4849ebe4cb0234c5d9793d0` | `complete` |
| `plans/completed/0056-project-json-language-tooling.md` | `features/0056-project-json-language-tooling/plan.md` | `0d04d56df6fb2e7ba5b2571743d485889284fe5848b408ffceea276e8e723b19` | `complete` |
| `plans/completed/0057-control-room-agent-observation-correlation.md` | `features/0057-control-room-agent-observation-correlation/plan.md` | `4360bd48b55d299a823e48bfe0349e39c7e6c1c73c8b4d2ee513091d633a2288` | `complete` |
| `plans/superseded/0020-lossless-kernel-source.md` | `features/0020-lossless-kernel-source/plan.md` | `7a231164b81ee689bea33c64edb98116f7c9b765ada050951bb38afb0b9df4db` | `superseded` |
| `plans/superseded/0049-canonical-work-lifecycle.md` | `features/0049-canonical-work-lifecycle/plan.md` | `fe6f1d3cc62d035ceee24b2ea8d6d028fc2b7c855335cf689a9f35a45347ebfc` | `superseded` |
| `scripts/accept/0002-reference-baselines-deep-research.ts` | `features/0002-reference-baselines-deep-research/accept.ts` | `28282f4f86e56f2daa913b16f0780671302203bcd854b79e8b864ebff6c84f0a` | `complete` |
| `scripts/accept/0005-autonomous-development-control-loop.ts` | `features/0005-autonomous-development-control-loop/accept.ts` | `76905a73246ff043d7083a32293455330b04ce51fa1c059d5a45ffccc58c006a` | `in_progress` |
| `scripts/accept/0007-reuse-first-engineering.ts` | `features/0007-reuse-first-engineering/accept.ts` | `bc70a8f0a42d0d236151c4895f1b4919207747c56579f50ecdc2b22fbd880dae` | `blocked` |
| `scripts/accept/0010-typescript-effect-v4-runtime.ts` | `features/0010-typescript-effect-v4-runtime/accept.ts` | `0d0d33e162bb8302618862f0153ef168e4f9da736e00e0576f7cb55ba181efa0` | `complete` |
| `scripts/accept/0012-minimal-actor-runtime.ts` | `features/0012-minimal-actor-runtime/accept.ts` | `8c140b11b22d82a80ddc7337dca5ef259a1d163b8fb5c7366e10798f62916b36` | `complete` |
| `scripts/accept/0013-bounded-actor-trace-retention.ts` | `features/0013-bounded-actor-trace-retention/accept.ts` | `9904a961b806bbd63d7a4f6a86c26ec3e2f68effee9a317a2f11e0bf6633397e` | `complete` |
| `scripts/accept/0014-stm-effect-handler-laws.ts` | `features/0014-stm-effect-handler-laws/accept.ts` | `21e0f0becbb0f9b4c1fd5236851caa09fb2df03db31d676f3d62cf82fb7603a9` | `complete` |
| `scripts/accept/0015-open-semantic-system-design-lens.ts` | `features/0015-open-semantic-system-design-lens/accept.ts` | `1c154201b2c6b6a42567f843b2fa8c1aad3bb2377fddb4f497a8859385d272b0` | `complete` |
| `scripts/accept/0016-executable-semantic-system-kernel.ts` | `features/0016-executable-semantic-system-kernel/accept.ts` | `8cad4cbbeddbb9fbe1fae933871fd7922e9f692fa1ce17c42ec60cecf2917e9c` | `complete` |
| `scripts/accept/0017-control-room-reconstruction.ts` | `features/0017-control-room-reconstruction/accept.ts` | `496fc2c198445355c6230888f99cebc8e77aa549f6b910ab975e32ae2381c080` | `complete` |
| `scripts/accept/0018-minimal-kernel-calculus.ts` | `features/0018-minimal-kernel-calculus/accept.ts` | `013fb6cdc45d41b500f21f1ab7dec474d68ed7a7cbf40728c0e003c46d1bc1e1` | `complete` |
| `scripts/accept/0019-normalized-core-format.ts` | `features/0019-normalized-core-format/accept.ts` | `fb3b7c553491d1bee9ef0441d975ef688ac944921fe1e082227616c62cf30874` | `complete` |
| `scripts/accept/0020-agent-facing-kernel-json.ts` | `features/0020-agent-facing-kernel-json/accept.ts` | `af03561b62951c36577ef6bfe6a1a4035cbfadbd0f3507f8b96327bf3a244d15` | `complete` |
| `scripts/accept/0021-pbk-portfolio-control-room.ts` | `features/0021-pbk-portfolio-control-room/accept.ts` | `b8c8192a5986311916957c56f1dc2a385130cddbb94e1d2827ae6bcaa0654062` | `complete` |
| `scripts/accept/0022-kernel-reference-interpreter.ts` | `features/0022-kernel-reference-interpreter/accept.ts` | `8d8228ab7beefdd70b4b612d7de186af04ee2109c2273a6fdf25656c96fd09d1` | `complete` |
| `scripts/accept/0031-control-room-interactive-skill-tree.ts` | `features/0031-control-room-interactive-skill-tree/accept.ts` | `842a85916f7728010b7a64cd22005f2a825313f10091ea0e3a3bbf7186e33afa` | `complete` |
| `scripts/accept/0046-effect-graph-execution-index.ts` | `features/0046-effect-graph-execution-index/accept.ts` | `2a84375c7fbc5eff3ebcbf1ce7c756ec237127e71c35fc0a98f5e416e254349a` | `complete` |
| `scripts/accept/0048-pbk-control-room-acceptance-reconciliation.ts` | `features/0048-pbk-control-room-acceptance-reconciliation/accept.ts` | `4c1ddeaddc6b24ab105fdd40343c5861bc332e75c3b4b1e362f2fe8510858ca4` | `complete` |
| `scripts/accept/0050-bounded-stm-runtime.ts` | `features/0050-bounded-stm-runtime/accept.ts` | `800a5d419c172aed50d96a360b15150c99a8c206a7c30ada1d9e7872d60d7b91` | `complete` |
| `scripts/accept/0051-kernel-finite-sums.ts` | `features/0051-kernel-finite-sums/accept.ts` | `7909db2881c2a450ab7f01d764cd3d08bdbcdcc53bd58d39c144e66e9d58c562` | `complete` |
| `scripts/accept/0052-stm-schedule-explorer.ts` | `features/0052-stm-schedule-explorer/accept.ts` | `1e6d4720394f32ae80c311b0a1823d83acebb1fffe04bc3c588129c8b3e7b2a9` | `complete` |
| `scripts/accept/0053-relational-fact-export.ts` | `features/0053-relational-fact-export/accept.ts` | `ba0218c434746486c190fea2b2c482be2fa6d6cfba72de0d3085170f56d9275c` | `complete` |
| `scripts/accept/0054-semantic-contract-wit-mapping.ts` | `features/0054-semantic-contract-wit-mapping/accept.ts` | `1b05999a500bc7f1596599ddf9886f88e96795a9e38e4ca137714bb24bb8324b` | `complete` |
| `scripts/accept/0055-lifecycle-plan-layout.ts` | `features/0055-lifecycle-plan-layout/accept.ts` | `59e7bd09a75a70380a0871311b2996ee49effe5eb4d619666ac74019d4b44bea` | `complete` |
| `scripts/accept/0056-project-json-language-tooling.ts` | `features/0056-project-json-language-tooling/accept.ts` | `620398eeae03cdfc611f42d053e8847f69d7e4632b331d69ac0d5eca2e6cf0a8` | `complete` |
| `scripts/accept/0057-control-room-agent-observation-correlation.ts` | `features/0057-control-room-agent-observation-correlation/accept.ts` | `cabf833491c6c764db4481552959f9bef03600621e87043409300e00aad17991` | `complete` |
| `scripts/accept/0058-feature-dossier-workflow.ts` | `features/0058-feature-dossier-workflow/accept.ts` | `8d5ac35515dddff47b64c25bcba0095a6d1286a90319341f7a0eed385f958256` | `in_progress` |

## Semantic conflicts

None unresolved. Full slugged feature IDs are the stable identities; the shared numeric prefix of the two 0020 dossiers is not a duplicate identity.

## Evidence boundary

This migration preserves historical assertions and hashes. It does not fabricate runtime validation, proof, independent review, merge authority, provider observations, or closure observations.
