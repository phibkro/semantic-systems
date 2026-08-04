import { describe, expect, test } from "bun:test";
import { Effect } from "effect";
import { WorkflowError, runRepositoryWorkflow } from "../src/project-model/repository-workflow.ts";

const identity = (tree_identity: string) => ({
  repository: "semantic-systems",
  base: "base-001",
  head: "head-001",
  tree_identity,
  clean: true,
  tracked: true,
  changed_paths: [],
});

const impact_graph = {
  known_paths: ["src/example.ts"],
  always_checks: [{ id: "invariants", command: "just invariants", paths: [] }],
  affected_checks: [{ id: "local", command: "just local", paths: ["src/example.ts"] }],
  full_checks: [
    { id: "full", command: "just full", paths: [] },
    { id: "local", command: "just local", paths: ["src/example.ts"] },
  ],
};

const repair_policy = {
  allowed_effects: ["oxfmt_write"],
  oxfmt_output_paths: ["src/example.ts"],
  oxlint_output_paths: [],
  generated_view_input_paths: [],
  generated_view_output_paths: [],
  max_attempts: 2,
};
const generated_paths = [
  "generated/01-system-map.md",
  "generated/02-theory-realization.md",
  "generated/03-concern-matrix.md",
  "generated/04-evidence-map.md",
  "generated/05-work-dependencies.md",
  "generated/06-delegation-frontier.md",
  "generated/07-runtime-view.md",
  "generated/08-feature-lifecycle.md",
  "generated/README.md",
  "generated/project-model/work-features.json",
  "generated/schema/project-document.schema.json",
  ".omp/lsp.json",
];

const generated_repair_policy = {
  allowed_effects: ["generated_view_regeneration"],
  oxfmt_output_paths: [],
  oxlint_output_paths: [],
  generated_view_input_paths: [
    "model",
    "features",
    "src/project-model",
    "package.json",
    "tsconfig.json",
    ".omp/lsp.json",
  ],
  generated_view_output_paths: generated_paths,
  max_attempts: 2,
};

const checkInput = (overrides: Record<string, unknown> = {}) => ({
  command: "check",
  mode: "repair",
  tree: identity("tree-001"),
  affected_paths: ["src/example.ts"],
  impact_graph,
  repair_policy,
  command_observations: [
    {
      plan_id: "check:invariants",
      mode: "repair",
      run: 1,
      status: "succeeded",
      input_tree_identity: "tree-001",
      output_tree_identity: "tree-001",
      changed_paths: [],
    },
    {
      plan_id: "check:local",
      mode: "repair",
      run: 1,
      status: "succeeded",
      input_tree_identity: "tree-001",
      output_tree_identity: "tree-001",
      changed_paths: [],
    },
    {
      plan_id: "repair:oxfmt-write",
      mode: "repair",
      run: 1,
      status: "succeeded",
      input_tree_identity: "tree-001",
      output_tree_identity: "tree-002",
      changed_paths: ["src/example.ts"],
    },
    {
      plan_id: "repair:oxfmt-write",
      mode: "repair",
      run: 2,
      status: "succeeded",
      input_tree_identity: "tree-002",
      output_tree_identity: "tree-002",
      changed_paths: [],
    },
  ],
  ...overrides,
});
const generatedCheckInput = (
  affected_paths: ReadonlyArray<string>,
  command_observations: ReadonlyArray<Record<string, unknown>>,
) => ({
  command: "check",
  mode: "repair",
  tree: identity("tree-001"),
  affected_paths,
  impact_graph: {
    known_paths: [
      "model",
      "features",
      "src",
      "package.json",
      "tsconfig.json",
      ".omp/lsp.json",
      ...generated_paths,
    ],
    always_checks: [],
    affected_checks: [],
    full_checks: [],
  },
  repair_policy: generated_repair_policy,
  command_observations,
});

const run = <A, E>(effect: Effect.Effect<A, E>): Promise<A> => Effect.runPromise(effect);

const errorOf = async (input: unknown): Promise<WorkflowError> => {
  const result = await Effect.runPromise(
    runRepositoryWorkflow(input).pipe(
      Effect.as<WorkflowError | undefined>(undefined),
      Effect.catch((error) => Effect.succeed(error)),
    ),
  );
  if (!(result instanceof WorkflowError)) {
    throw new Error("expected a WorkflowError failure");
  }
  return result;
};

describe("repository workflow runner", () => {
  test("reports a deterministic local repair without turning it into verification", async () => {
    const receipt = await run(runRepositoryWorkflow(checkInput()));

    expect(receipt.verdict).toBe("repaired");
    expect(receipt.touched_paths).toEqual(["src/example.ts"]);
    expect(receipt.input_tree_identity).toBe("tree-001");
    expect(receipt.output_tree_identity).toBe("tree-002");
    expect(receipt.evidence.category).toBe("local_repair");
    expect(receipt.evidence.authoritative).toBeFalse();
    expect(receipt.command_plans.map((plan) => plan.id)).toEqual([
      "check:invariants",
      "check:local",
      "repair:oxfmt-write",
    ]);
  });
  test("schedules every generated projection for a canonical source edit", async () => {
    const receipt = await run(
      runRepositoryWorkflow(
        generatedCheckInput(
          ["src/project-model/repository-workflow.ts"],
          [
            {
              plan_id: "repair:generated-view-regeneration",
              mode: "repair",
              run: 1,
              status: "succeeded",
              input_tree_identity: "tree-001",
              output_tree_identity: "tree-001",
              changed_paths: [],
            },
          ],
        ),
      ),
    );

    expect(receipt.verdict).toBe("clean");
    expect(receipt.command_plans).toHaveLength(1);
    expect(receipt.command_plans[0]?.declared_output_paths).toEqual([...generated_paths].sort());
  });

  test("does not expand generated repair outputs for unrelated paths", async () => {
    const receipt = await run(runRepositoryWorkflow(generatedCheckInput(["docs/new.md"], [])));

    expect(receipt.verdict).toBe("clean");
    expect(receipt.command_plans).toEqual([]);
  });

  test("rejects a repair that mutates an undeclared path", async () => {
    const error = await errorOf(
      checkInput({
        command_observations: [
          ...checkInput().command_observations.slice(0, 2),
          {
            plan_id: "repair:oxfmt-write",
            mode: "repair",
            run: 1,
            status: "succeeded",
            input_tree_identity: "tree-001",
            output_tree_identity: "tree-002",
            changed_paths: ["README.md"],
          },
        ],
      }),
    );
    expect(error.code).toBe("undeclared_mutation");
  });

  test("rejects a non-idempotent fixer after its bounded second run", async () => {
    const error = await errorOf(
      checkInput({
        command_observations: [
          ...checkInput().command_observations.slice(0, 2),
          {
            plan_id: "repair:oxfmt-write",
            mode: "repair",
            run: 1,
            status: "succeeded",
            input_tree_identity: "tree-001",
            output_tree_identity: "tree-002",
            changed_paths: ["src/example.ts"],
          },
          {
            plan_id: "repair:oxfmt-write",
            mode: "repair",
            run: 2,
            status: "succeeded",
            input_tree_identity: "tree-002",
            output_tree_identity: "tree-003",
            changed_paths: ["src/example.ts"],
          },
        ],
      }),
    );
    expect(error.code).toBe("non_idempotent_repair");
  });

  test("verify rejects a dirty tracked tree and remains observe-only", async () => {
    const error = await errorOf({
      command: "verify",
      mode: "observe",
      tree: { ...identity("tree-001"), clean: false, changed_paths: ["src/example.ts"] },
      expected_base: "base-001",
      expected_head: "head-001",
      command_plans: [
        {
          id: "verify:delivery",
          command: "just delivery",
          mode: "observe",
          effect: "observe",
          affected_paths: [],
          declared_output_paths: [],
        },
      ],
      command_observations: [
        {
          plan_id: "verify:delivery",
          mode: "observe",
          run: 1,
          status: "succeeded",
          input_tree_identity: "tree-001",
          output_tree_identity: "tree-001",
          changed_paths: [],
        },
      ],
    });
    expect(error.code).toBe("dirty_tree");
  });
  test("verify rejects expectations that do not match observed identities", async () => {
    const error = await errorOf({
      command: "verify",
      mode: "observe",
      tree: identity("tree-001"),
      expected_base: "wrong-base",
      expected_head: "head-001",
      command_plans: [
        {
          id: "verify:delivery",
          command: "just delivery",
          mode: "observe",
          effect: "observe",
          affected_paths: [],
          declared_output_paths: [],
        },
      ],
      command_observations: [],
    });

    expect(error.code).toBe("base_mismatch");
  });
  test("canonical acceptance remains observe-only during verify", async () => {
    const error = await errorOf({
      command: "verify",
      mode: "observe",
      tree: identity("tree-001"),
      expected_base: "base-001",
      expected_head: "head-001",
      command_plans: [
        {
          id: "verify:acceptance",
          command: "bun features/0058-feature-dossier-workflow/accept.ts",
          mode: "observe",
          effect: "observe",
          affected_paths: [],
          declared_output_paths: [],
        },
      ],
      command_observations: [
        {
          plan_id: "verify:acceptance",
          mode: "observe",
          run: 1,
          status: "succeeded",
          input_tree_identity: "tree-001",
          output_tree_identity: "tree-001",
          changed_paths: ["features/0058-feature-dossier-workflow/accept.ts"],
        },
      ],
    });

    expect(error.code).toBe("verify_mutation");
  });

  test("unknown affected paths select the larger impact-graph check set", async () => {
    const input = checkInput({
      affected_paths: ["unknown/new-file.ts"],
      command_observations: [
        {
          plan_id: "check:invariants",
          mode: "repair",
          run: 1,
          status: "succeeded",
          input_tree_identity: "tree-001",
          output_tree_identity: "tree-001",
          changed_paths: [],
        },
        {
          plan_id: "check:full",
          mode: "repair",
          run: 1,
          status: "succeeded",
          input_tree_identity: "tree-001",
          output_tree_identity: "tree-001",
          changed_paths: [],
        },
        {
          plan_id: "check:local",
          mode: "repair",
          run: 1,
          status: "succeeded",
          input_tree_identity: "tree-001",
          output_tree_identity: "tree-001",
          changed_paths: [],
        },
      ],
    });
    const receipt = await run(runRepositoryWorkflow(input));

    expect(receipt.check_scope).toBe("full");
    expect(receipt.command_plans.map((plan) => plan.id)).toEqual([
      "check:full",
      "check:invariants",
      "check:local",
    ]);
  });

  test("start is idempotent for one matching checkout and rejects conflicts", async () => {
    const common = {
      command: "start",
      mode: "mutate",
      tree: identity("tree-001"),
      feature_id: "0058-feature-dossier-workflow",
      specification: { frozen: true, identity: "spec-001" },
      plan: { active: true, identity: "plan-001" },
      requested_base: "base-001",
      requested_branch: "feature/0058-feature-dossier-workflow",
      requested_worktree: ".worktrees/0058",
      requested_lease: "lease-0058",
    };

    const receipt = await run(
      runRepositoryWorkflow({
        ...common,
        existing_checkouts: [
          {
            feature_id: common.feature_id,
            base: common.requested_base,
            branch: common.requested_branch,
            worktree: common.requested_worktree,
            lease: common.requested_lease,
          },
        ],
        command_observations: [],
      }),
    );
    expect(receipt.verdict).toBe("started");
    expect(receipt.idempotent).toBeTrue();
    expect(receipt.command_plans).toEqual([]);

    const error = await errorOf({
      ...common,
      existing_checkouts: [
        {
          feature_id: common.feature_id,
          base: "different-base",
          branch: common.requested_branch,
          worktree: common.requested_worktree,
          lease: common.requested_lease,
        },
      ],
      command_observations: [],
    });
    expect(error.code).toBe("conflicting_checkout");
  });

  test("setup accepts only pinned dependency, checked hook, and ignored receipt effects", async () => {
    const receipt = await run(
      runRepositoryWorkflow({
        command: "setup",
        mode: "mutate",
        tree: identity("tree-001"),
        effects: [
          {
            id: "setup:dependencies",
            command: "bun install --frozen-lockfile",
            effect: "pinned_dependency_install",
            declared_output_paths: ["node_modules/.cache"],
          },
          {
            id: "setup:hooks",
            command: "configure checked hooks",
            effect: "checked_hook_configuration",
            declared_output_paths: [".githooks/pre-commit"],
          },
          {
            id: "setup:receipt",
            command: "write ignored setup receipt",
            effect: "ignored_setup_receipt",
            declared_output_paths: [".git/setup-receipt.json"],
          },
        ],
        command_observations: [
          {
            plan_id: "setup:dependencies",
            mode: "mutate",
            run: 1,
            status: "succeeded",
            input_tree_identity: "tree-001",
            output_tree_identity: "tree-001",
            changed_paths: ["node_modules/.cache"],
          },
          {
            plan_id: "setup:hooks",
            mode: "mutate",
            run: 1,
            status: "succeeded",
            input_tree_identity: "tree-001",
            output_tree_identity: "tree-001",
            changed_paths: [".githooks/pre-commit"],
          },
          {
            plan_id: "setup:receipt",
            mode: "mutate",
            run: 1,
            status: "succeeded",
            input_tree_identity: "tree-001",
            output_tree_identity: "tree-001",
            changed_paths: [".git/setup-receipt.json"],
          },
        ],
      }),
    );
    expect(receipt.verdict).toBe("prepared");
    expect(receipt.touched_paths).toEqual([
      ".git/setup-receipt.json",
      ".githooks/pre-commit",
      "node_modules/.cache",
    ]);

    const error = await errorOf({
      command: "setup",
      mode: "mutate",
      tree: identity("tree-001"),
      effects: [
        {
          id: "setup:lockfile",
          command: "rewrite lockfile",
          effect: "lockfile_rewrite",
          declared_output_paths: ["bun.lock"],
        },
      ],
      command_observations: [],
    });
    expect(error.code).toBe("invalid_input");
  });
});
