import { VALIDATION_ISSUE_CODE, type ValidationIssueCode } from "./validate.ts";

export type EnforcementRung =
  | "generated"
  | "static"
  | "model_checked"
  | "tested"
  | "runtime_checked"
  | "convention";

export type EnforcementEnvironment =
  | "repository"
  | "nix"
  | "nix-develop"
  | "bun-1.3.13"
  | "node-24"
  | "git"
  | "pull-request";

export type EnforcementArtifactEntry = {
  readonly id: string;
  readonly claim: string;
  readonly source: string;
  readonly environment: EnforcementEnvironment;
  readonly rung: EnforcementRung;
  readonly classification: "artifact-backed";
  readonly artifact: string;
};

export type EnforcementReviewEntry = {
  readonly id: string;
  readonly claim: string;
  readonly source: string;
  readonly environment: EnforcementEnvironment;
  readonly rung: "convention";
  readonly classification: "review-only";
  readonly artifact: null;
  readonly reviewReason: string;
};

export type EnforcementRegisterEntry = EnforcementArtifactEntry | EnforcementReviewEntry;

export const VALIDATION_ISSUE_CODES: ReadonlyArray<ValidationIssueCode> = Object.freeze(
  Object.values(VALIDATION_ISSUE_CODE),
);

export type ValidationIssueCodeEntry = {
  readonly code: ValidationIssueCode;
  readonly severity: "error" | "warning";
  readonly producer: "validateProject";
};

/** One metadata row per finite validation code; tests prove the rows are live. */
export const VALIDATION_ISSUE_CODE_REGISTRY: ReadonlyArray<ValidationIssueCodeEntry> =
  Object.freeze([
    { code: VALIDATION_ISSUE_CODE.entityKind, severity: "error", producer: "validateProject" },
    { code: VALIDATION_ISSUE_CODE.entityId, severity: "error", producer: "validateProject" },
    { code: VALIDATION_ISSUE_CODE.evidenceType, severity: "error", producer: "validateProject" },
    { code: VALIDATION_ISSUE_CODE.relationKind, severity: "error", producer: "validateProject" },
    { code: VALIDATION_ISSUE_CODE.relationSource, severity: "error", producer: "validateProject" },
    { code: VALIDATION_ISSUE_CODE.relationTarget, severity: "error", producer: "validateProject" },
    {
      code: VALIDATION_ISSUE_CODE.containmentCycle,
      severity: "error",
      producer: "validateProject",
    },
    { code: VALIDATION_ISSUE_CODE.workCycle, severity: "error", producer: "validateProject" },
    {
      code: VALIDATION_ISSUE_CODE.claimUnsupported,
      severity: "warning",
      producer: "validateProject",
    },
  ]);

const artifact = (
  id: string,
  claim: string,
  source: string,
  environment: EnforcementEnvironment,
  rung: Exclude<EnforcementRung, "convention">,
  enforcingArtifact: string,
): EnforcementArtifactEntry => ({
  id,
  claim,
  source,
  environment,
  rung,
  classification: "artifact-backed",
  artifact: enforcingArtifact,
});

const reviewOnly = (
  id: string,
  claim: string,
  source: string,
  reviewReason: string,
): EnforcementReviewEntry => ({
  id,
  claim,
  source,
  environment: "repository",
  rung: "convention",
  classification: "review-only",
  artifact: null,
  reviewReason,
});

/**
 * Typed inventory of active AGENTS.md invariants and validation claims,
 * CONTRIBUTING.md gates, package scripts, and `scripts/check*.ts` commands.
 *
 * Review-only entries are intentionally explicit: prose cannot be upgraded to
 * static or generated enforcement without a named artifact.
 */
export const ENFORCEMENT_REGISTER: ReadonlyArray<EnforcementRegisterEntry> = Object.freeze([
  reviewOnly(
    "agents.trusted-core-small",
    "The trusted core stays small.",
    "AGENTS.md#12",
    "Core size and trust-boundary quality require semantic review.",
  ),
  reviewOnly(
    "agents.theories-before-realizations",
    "Theories are specified before realizations.",
    "AGENTS.md#13",
    "Ordering of semantic design work is not mechanically observable.",
  ),
  reviewOnly(
    "agents.evidence-distinction",
    "Proof, analysis, model checking, testing, benchmarking, runtime validation, assertion, and assumption are never equated.",
    "AGENTS.md#14-15",
    "Evidence-category meaning needs an independent semantic review.",
  ),
  reviewOnly(
    "agents.assumptions-visible",
    "Assumptions remain transitive and visible.",
    "AGENTS.md#16",
    "The canonical graph records assumptions, but completeness beyond recorded edges is review-only.",
  ),
  reviewOnly(
    "agents.effects-capability-contracts",
    "Effects are capability contracts and handlers are interpretations.",
    "AGENTS.md#17",
    "The portable-boundary lint constrains runtime imports and ambient capabilities, but cannot establish the full semantic interpretation.",
  ),
  reviewOnly(
    "agents.orthogonal-identities",
    "Ownership, dependency, derivation, causality, and observation remain distinct.",
    "AGENTS.md#18",
    "Cross-graph semantic distinctions are not fully enforced by a single static rule.",
  ),
  artifact(
    "agents.generated-views-are-projections",
    "Generated views are projections of canonical sources.",
    "AGENTS.md#19",
    "bun-1.3.13",
    "generated",
    "src/project-model/views.ts; scripts/check-fast.ts",
  ),
  reviewOnly(
    "agents.executable-tracer-bullet",
    "Every important abstraction has an executable tracer bullet.",
    "AGENTS.md#20",
    "No finite inventory proves that every future abstraction has a tracer bullet.",
  ),
  reviewOnly(
    "agents.unsupported-decisions-visible",
    "Unsupported claims and automated decisions are exposed.",
    "AGENTS.md#21",
    "Whether explanations are sufficient remains a semantic review obligation.",
  ),
  artifact(
    "agents.design-lens-before-freeze",
    "The open semantic system design lens is applied before freezing a software-system design.",
    "AGENTS.md#22-25",
    "pull-request",
    "static",
    "src/project-model/feature-loader.ts; src/project-model/design-lens-validation.ts",
  ),
  reviewOnly(
    "agents.parallel-frontiers",
    "Independent semantic frontiers advance concurrently only when contracts, files, and gates do not overlap.",
    "AGENTS.md#26-28",
    "Concurrent ownership decisions require integration-agent review.",
  ),
  reviewOnly(
    "agents.pinned-environment-loop",
    "The repository enters the pinned Nix environment before the fast and integration loops.",
    "AGENTS.md#45-57",
    "The flake defines a pinned environment, but repository gates cannot prove which host environment invoked them.",
  ),
  artifact(
    "agents.missing-tools-fail-closed",
    "A missing required tool fails a gate rather than becoming a warning.",
    "AGENTS.md#65-67",
    "nix-develop",
    "static",
    "scripts/lib/command.ts; scripts/check-fast.ts; scripts/check-references.ts",
  ),
  artifact(
    "flake.repository-invariants",
    "`nix flake check` runs repository-source invariants and commit-policy conformance as sandboxed derivations.",
    "AGENTS.md#65-67; CONTRIBUTING.md#45-47",
    "nix",
    "static",
    "flake.nix; scripts/check-commit-policy.ts",
  ),
  artifact(
    "agents.commit-policy-conformance",
    "Commit messages follow the Conventional Commits policy.",
    "AGENTS.md#68-70",
    "git",
    "static",
    "commitlint.config.ts; scripts/check-commit-policy.ts",
  ),
  reviewOnly(
    "agents.pull-request-title-policy",
    "Pull-request titles follow the Conventional Commits policy.",
    "AGENTS.md#68-70",
    "No checked repository gate observes hosted pull-request titles.",
  ),
  reviewOnly(
    "agents.unavailable-checks-reported",
    "Checks that were not run or were unavailable are reported rather than inferred green.",
    "AGENTS.md#70-71",
    "The integrating agent must report execution history; no local gate can prove an omitted check was reported.",
  ),
  reviewOnly(
    "contributing.edit-canonical-sources",
    "Canonical model files are edited instead of generated views.",
    "CONTRIBUTING.md#3-12",
    "Generated drift is checked, but the repository cannot infer which side an editor changed first.",
  ),
  artifact(
    "contributing.generated-view-drift",
    "Generated project-model views match their canonical sources.",
    "CONTRIBUTING.md#3-12",
    "bun-1.3.13",
    "generated",
    "src/project-model/cli.ts; scripts/check-fast.ts",
  ),
  reviewOnly(
    "contributing.model-and-view-commit",
    "Canonical model and generated-view changes are committed together.",
    "CONTRIBUTING.md#3-12",
    "Generated drift is checked, but commit co-change intent requires review.",
  ),
  artifact(
    "contributing.fast-loop",
    "The fast loop covers formatting, lint, typecheck, model validation/generation, and commit policy.",
    "CONTRIBUTING.md#14-38",
    "nix-develop",
    "static",
    "justfile; scripts/check-fast.ts",
  ),
  artifact(
    "contributing.integration-loop",
    "The integration loop runs the frozen install, fast loop, and complete Bun test corpus.",
    "CONTRIBUTING.md#34-42",
    "nix-develop",
    "static",
    "justfile; scripts/check.ts",
  ),
  artifact(
    "contributing.feature-loop",
    "A feature loop runs the exact Bun acceptance program for one frozen design spec.",
    "CONTRIBUTING.md#34-38",
    "nix-develop",
    "runtime_checked",
    "justfile; scripts/check.ts; scripts/workflow-adapter.ts",
  ),
  artifact(
    "contributing.frozen-install",
    "The integration loop installs exact locked JavaScript tools with lifecycle scripts disabled.",
    "CONTRIBUTING.md#20-32",
    "nix-develop",
    "static",
    "scripts/check.ts; bun.lock",
  ),
  reviewOnly(
    "contributing.local-hooks-advisory",
    "Local hooks improve feedback latency but are advisory and bypassable.",
    "CONTRIBUTING.md#28-32,60-62",
    "The repository cannot observe a developer's bypassed local hook in every environment.",
  ),
  reviewOnly(
    "contributing.external-ci-prerequisites",
    "External branch protection, merge queue, and merge strategy are not claimed active by this checkout.",
    "CONTRIBUTING.md#60-67",
    "Repository files cannot establish external hosting configuration.",
  ),
  artifact(
    "contributing.feature-artifact-ownership",
    "A nontrivial feature owns one stable ID across its canonical dossier, branch, and pull request.",
    "CONTRIBUTING.md#69-77",
    "pull-request",
    "static",
    "src/project-model/feature-loader.ts; src/project-model/work-lifecycle.ts",
  ),
  reviewOnly(
    "contributing.semantic-feature-proposal",
    "A semantic feature proposal identifies its distinction, boundary, effects, runtime, evidence, and tracer bullet.",
    "CONTRIBUTING.md#101-110",
    "Proposal quality and semantic fit require review.",
  ),
  artifact(
    "contributing.required-work-metadata",
    "Every work item has a phase, acceptance criteria, and delegation metadata.",
    "CONTRIBUTING.md#112-120",
    "bun-1.3.13",
    "model_checked",
    "src/project-model/validate.ts",
  ),
  reviewOnly(
    "contributing.work-change-accounting",
    "Every work item records blockers, decisions, and changed semantic artifacts.",
    "CONTRIBUTING.md#112-120",
    "Completeness of authored blockers, decisions, and change accounting requires semantic review.",
  ),
  artifact(
    "package.prepare",
    "`bun run prepare` installs the repository's advisory hooks during package preparation.",
    "package.json#scripts.prepare",
    "bun-1.3.13",
    "static",
    "package.json; scripts/install-git-hooks.ts",
  ),
  artifact(
    "package.commitlint",
    "`bun run commitlint` invokes the configured Conventional Commits linter.",
    "package.json#scripts.commitlint",
    "bun-1.3.13",
    "static",
    "package.json; commitlint.config.ts",
  ),
  artifact(
    "package.test",
    "`bun run test` executes the complete Bun test corpus with a 30-second per-test bound.",
    "package.json#scripts.test; CONTRIBUTING.md#40-42",
    "bun-1.3.13",
    "tested",
    "package.json; tests/",
  ),
  artifact(
    "package.test-project-model",
    "`bun run test:project-model` executes the focused project-model test file.",
    "package.json#scripts.test:project-model",
    "bun-1.3.13",
    "tested",
    "package.json; tests/project-model.test.ts",
  ),
  artifact(
    "package.semproj",
    "`bun run semproj` exposes the project-model CLI.",
    "package.json#scripts.semproj",
    "bun-1.3.13",
    "runtime_checked",
    "package.json; src/project-model/main-bun.ts",
  ),
  artifact(
    "package.semrefs",
    "`bun run semrefs` exposes the reference-custody CLI.",
    "package.json#scripts.semrefs",
    "bun-1.3.13",
    "runtime_checked",
    "package.json; src/references/main-bun.ts",
  ),
  artifact(
    "package.semantic-tracer",
    "`bun run semantic-tracer` exposes the inventory tracer CLI.",
    "package.json#scripts.semantic-tracer",
    "bun-1.3.13",
    "runtime_checked",
    "package.json; src/tracer/main-bun.ts",
  ),
  artifact(
    "package.semantic-actor",
    "`bun run semantic-actor` exposes the actor CLI.",
    "package.json#scripts.semantic-actor",
    "bun-1.3.13",
    "runtime_checked",
    "package.json; src/actor/main-bun.ts",
  ),
  artifact(
    "package.semproj-node",
    "`bun run semproj:node` exposes the project-model CLI through genuine Node.",
    "package.json#scripts.semproj:node",
    "node-24",
    "runtime_checked",
    "package.json; src/project-model/main-node.ts",
  ),
  artifact(
    "package.semrefs-node",
    "`bun run semrefs:node` exposes the reference-custody CLI through genuine Node.",
    "package.json#scripts.semrefs:node",
    "node-24",
    "runtime_checked",
    "package.json; src/references/main-node.ts",
  ),
  artifact(
    "package.semantic-tracer-node",
    "`bun run semantic-tracer:node` exposes the inventory tracer CLI through genuine Node.",
    "package.json#scripts.semantic-tracer:node",
    "node-24",
    "runtime_checked",
    "package.json; src/tracer/main-node.ts",
  ),
  artifact(
    "package.semantic-actor-node",
    "`bun run semantic-actor:node` exposes the actor CLI through genuine Node.",
    "package.json#scripts.semantic-actor:node",
    "node-24",
    "runtime_checked",
    "package.json; src/actor/main-node.ts",
  ),
  artifact(
    "package.fast",
    "`bun run fast` dispatches the fast gate.",
    "package.json#scripts.fast",
    "bun-1.3.13",
    "runtime_checked",
    "package.json; scripts/check-fast.ts",
  ),
  artifact(
    "package.check",
    "`bun run check` dispatches the integration gate.",
    "package.json#scripts.check",
    "bun-1.3.13",
    "runtime_checked",
    "package.json; scripts/check.ts",
  ),
  artifact(
    "package.format-check",
    "`bun run format:check` rejects files that are not normalized by Oxfmt.",
    "package.json#scripts.format:check; CONTRIBUTING.md#88-99",
    "nix-develop",
    "static",
    "package.json; .oxfmtrc.json; node_modules/.bin/oxfmt",
  ),
  artifact(
    "package.lint",
    "`bun run lint` rejects configured Oxlint warnings and errors.",
    "package.json#scripts.lint; CONTRIBUTING.md#88-99",
    "nix-develop",
    "static",
    "package.json; .oxlintrc.json; node_modules/.bin/oxlint",
  ),
  artifact(
    "package.typecheck",
    "`bun run typecheck` runs the pinned TypeScript compiler without emitting files.",
    "package.json#scripts.typecheck; CONTRIBUTING.md#88-99",
    "nix-develop",
    "static",
    "package.json; tsconfig.json; node_modules/.bin/tsc",
  ),
  artifact(
    "package.commit-policy",
    "`bun run check-commit-policy` validates materialized Conventional Commits provenance.",
    "package.json#scripts.check-commit-policy; CONTRIBUTING.md#49-58",
    "bun-1.3.13",
    "static",
    "package.json; scripts/check-commit-policy.ts",
  ),
  artifact(
    "package.effect-setup",
    "`bun run effect:setup` attaches the pinned Effect diagnostics to TypeScript 7.",
    "package.json#scripts.effect:setup; CONTRIBUTING.md#20-32",
    "nix-develop",
    "static",
    "package.json; scripts/setup-effect-tsgo.ts",
  ),
  artifact(
    "package.hooks-install",
    "`bun run hooks:install` materializes the checked advisory hook path.",
    "package.json#scripts.hooks:install; CONTRIBUTING.md#28-32",
    "git",
    "static",
    "package.json; scripts/install-git-hooks.ts",
  ),
  artifact(
    "package.control-room-check",
    "`bun run control-room:check` runs the control-room package check.",
    "package.json#scripts.control-room:check",
    "bun-1.3.13",
    "runtime_checked",
    "package.json; apps/control-room/package.json",
  ),
  artifact(
    "package.control-room-preview",
    "`bun run control-room:preview` starts the control-room preview.",
    "package.json#scripts.control-room:preview",
    "bun-1.3.13",
    "runtime_checked",
    "package.json; apps/control-room/package.json",
  ),
  artifact(
    "check-fast.tool-presence",
    "The fast gate requires Bun, actionlint, and Just.",
    "scripts/check-fast.ts#28-41",
    "nix-develop",
    "static",
    "scripts/check-fast.ts; scripts/lib/command.ts",
  ),
  artifact(
    "check-fast.executable-presence",
    "The fast gate requires executable Oxfmt, Oxlint, TypeScript, and Commitlint binaries.",
    "scripts/check-fast.ts#34-40",
    "nix-develop",
    "static",
    "scripts/check-fast.ts; scripts/lib/command.ts",
  ),
  artifact(
    "check-fast.project-validate",
    "The fast gate runs project-model validation.",
    "scripts/check-fast.ts#43-45",
    "nix-develop",
    "model_checked",
    "scripts/check-fast.ts; src/project-model/cli.ts",
  ),
  artifact(
    "check-fast.generated-check",
    "The fast gate rejects stale generated projections.",
    "scripts/check-fast.ts#45-46",
    "nix-develop",
    "generated",
    "scripts/check-fast.ts; src/project-model/views.ts",
  ),
  artifact(
    "check-fast.workflow-lint",
    "The fast gate runs actionlint over the checked workflow.",
    "scripts/check-fast.ts#46-47",
    "nix-develop",
    "static",
    "scripts/check-fast.ts; .github/workflows/check.yml",
  ),
  artifact(
    "check-fast.just-format",
    "The fast gate checks Justfile formatting.",
    "scripts/check-fast.ts#47-48",
    "nix-develop",
    "static",
    "scripts/check-fast.ts; justfile",
  ),
  artifact(
    "check-fast.effect-setup",
    "The fast gate checks the Effect TSGO setup.",
    "scripts/check-fast.ts#48-49",
    "nix-develop",
    "static",
    "scripts/check-fast.ts; scripts/setup-effect-tsgo.ts",
  ),
  artifact(
    "check-fast.format",
    "The fast gate rejects Oxfmt drift across configured source and configuration paths.",
    "scripts/check-fast.ts#49-50",
    "nix-develop",
    "static",
    "scripts/check-fast.ts; package.json#scripts.format:check",
  ),
  artifact(
    "check-fast.lint",
    "The fast gate rejects Oxlint warnings and errors across configured source paths.",
    "scripts/check-fast.ts#50-51",
    "nix-develop",
    "static",
    "scripts/check-fast.ts; package.json#scripts.lint",
  ),
  artifact(
    "check-fast.typecheck",
    "The fast gate rejects TypeScript diagnostics.",
    "scripts/check-fast.ts#51-52",
    "nix-develop",
    "static",
    "scripts/check-fast.ts; package.json#scripts.typecheck",
  ),
  artifact(
    "check-fast.commit-policy",
    "The fast gate rejects drift from the checked Conventional Commits materialization.",
    "scripts/check-fast.ts#52-53",
    "nix-develop",
    "static",
    "scripts/check-fast.ts; scripts/check-commit-policy.ts",
  ),
  artifact(
    "check.integration-install",
    "The integration gate performs the frozen, lifecycle-disabled dependency install.",
    "scripts/check.ts#13-18",
    "nix-develop",
    "static",
    "scripts/check.ts; bun.lock",
  ),
  artifact(
    "check.integration-effect-setup",
    "The integration gate attaches the pinned Effect diagnostics before running the fast loop.",
    "scripts/check.ts#16-18",
    "nix-develop",
    "static",
    "scripts/check.ts; scripts/setup-effect-tsgo.ts",
  ),
  artifact(
    "check.integration-fast",
    "The integration gate runs the complete fast loop.",
    "scripts/check.ts#15-20",
    "nix-develop",
    "runtime_checked",
    "scripts/check.ts; scripts/check-fast.ts",
  ),
  artifact(
    "check.integration-tests",
    "The integration gate runs the complete Bun test corpus.",
    "scripts/check.ts#18-20",
    "nix-develop",
    "tested",
    "scripts/check.ts; package.json#scripts.test",
  ),
  artifact(
    "check-references.tool-presence",
    "The reference gate requires Bun, Node, Oxfmt, Oxlint, and TypeScript.",
    "scripts/check-references.ts#10-18",
    "nix-develop",
    "static",
    "scripts/check-references.ts; scripts/lib/command.ts",
  ),
  artifact(
    "check-references.custody-tests",
    "The reference gate runs the focused reference-custody tests.",
    "scripts/check-references.ts#20-22",
    "nix-develop",
    "tested",
    "scripts/check-references.ts; tests/reference-custody.test.ts",
  ),
  artifact(
    "check-references.typecheck",
    "The reference gate runs TypeScript typechecking.",
    "scripts/check-references.ts#22-24",
    "nix-develop",
    "static",
    "scripts/check-references.ts; package.json#scripts.typecheck",
  ),
  artifact(
    "check-references.lint",
    "The reference gate runs configured Oxlint.",
    "scripts/check-references.ts#22-24",
    "nix-develop",
    "static",
    "scripts/check-references.ts; package.json#scripts.lint",
  ),
  artifact(
    "check-references.format",
    "The reference gate checks formatting of the reference-custody paths.",
    "scripts/check-references.ts#24-25",
    "nix-develop",
    "static",
    "scripts/check-references.ts; node_modules/.bin/oxfmt",
  ),
  artifact(
    "check-references.catalog",
    "The reference gate runs the network-free catalog check in a genuine Node process.",
    "scripts/check-references.ts#25-27",
    "node-24",
    "runtime_checked",
    "scripts/check-references.ts; src/references/main-node.ts",
  ),
  artifact(
    "feature-dossier.design-lens",
    "Canonical feature specifications satisfy the required design-lens sections and markers.",
    "src/project-model/feature-loader.ts",
    "pull-request",
    "static",
    "src/project-model/feature-loader.ts; src/project-model/design-lens-validation.ts",
  ),
  artifact(
    "feature-dossier.migrations",
    "Canonical dossier loading rejects obsolete lifecycle authority paths and incomplete feature directories.",
    "src/project-model/feature-dossier.ts; src/project-model/feature-loader.ts",
    "pull-request",
    "static",
    "src/project-model/feature-dossier.ts; src/project-model/feature-loader.ts",
  ),
  artifact(
    "check-commit-policy.provenance",
    "The commit-policy gate checks the pinned block, upstream identity, digest, claims, adaptations, and project-owned hooks.",
    "scripts/check-commit-policy.ts#135-324",
    "git",
    "static",
    "scripts/check-commit-policy.ts; config/clamor-blocks/conventional-commits.provenance.json",
  ),
]);
