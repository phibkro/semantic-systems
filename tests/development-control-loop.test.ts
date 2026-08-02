import { afterEach, describe, expect, test } from "bun:test";
import { chmod, cp, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");
const WORKFLOW = join(ROOT, ".github", "workflows", "check.yml");
const FEATURE_POLICY = join(ROOT, "scripts", "check-feature-contract.ts");
const FEATURE_RUNNER = join(ROOT, "scripts", "run-feature-acceptance.ts");
const COMMIT_POLICY = join(ROOT, "scripts", "check-commit-policy.ts");
const PROVENANCE = join(ROOT, "config", "clamor-blocks", "conventional-commits.provenance.json");
const temporaryRoots: Array<string> = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((path) => rm(path, { recursive: true })));
});

const temporaryRoot = async (prefix: string): Promise<string> => {
  const path = await mkdtemp(join(tmpdir(), prefix));
  temporaryRoots.push(path);
  return path;
};

const run = (
  cmd: string[],
  options: { cwd?: string; env?: Record<string, string | undefined>; stdin?: string } = {},
) =>
  Bun.spawnSync({
    cmd,
    cwd: options.cwd ?? ROOT,
    env: options.env ?? process.env,
    stdin: options.stdin === undefined ? undefined : new TextEncoder().encode(options.stdin),
    stdout: "pipe",
    stderr: "pipe",
  });

const text = (result: ReturnType<typeof run>): string =>
  `${result.stdout.toString()}${result.stderr.toString()}`;

const git = (repo: string, ...args: ReadonlyArray<string>) => run(["git", ...args], { cwd: repo });

const commit = (repo: string, message: string): string => {
  expect(git(repo, "add", "-A").exitCode).toBe(0);
  const result = git(
    repo,
    "-c",
    "user.name=Feature Fixture",
    "-c",
    "user.email=fixture@example.invalid",
    "commit",
    "-m",
    message,
  );
  expect(result.exitCode).toBe(0);
  return git(repo, "rev-parse", "HEAD").stdout.toString().trim();
};

const validPrBody = (featureId: string): string => `Feature-ID: ${featureId}

## Design spec and semantic claim
The feature claim is falsifiable.

## User-visible preview
The exact acceptance script prints the observed result.

## Semantic diff
The fixture adds one bounded process feature.

## Checks run on this exact PR head
The exact acceptance and integration checks passed.

## Evidence categories and artifacts
Runtime validation from the acceptance script.

## Assumptions and unsupported claims
The fixture does not claim proof.

## Independent reviewer / counterexamples considered
Missing and duplicated markers were considered.

## Deviations and next uncertainty
No deviations; branch protection remains external.

## Cleanup
Cleanup occurs after merge.
`;

const completeDesignLens = (title = "frozen feature"): string => `# ${title}

Design-Lens-Version: open-semantic-system-v1

## Open semantic system design lens

### Boundary and warranted state

The fixture owns one bounded state transition; Git and CI remain environmental.

### Semantic inputs

The command requests validation and the event payload is an attributed observation.

### Semantic outputs

The verdict is an artifact; writing it to a check run remains an effect.

### Effect protocols and uncertainty

The fixture records accepted, rejected, and unknown execution outcomes without equating timeout with non-execution.

### Components and orthogonal structures

Validation ownership, process lifetime, communication, derivation, and CI placement remain distinct.

### Bounded autonomy and resources

One invocation has bounded input, process count, and completion time.

### Evidence, assumptions, and unsupported claims

Example tests establish only observed cases and do not prove semantic correctness.
`;

const featurePlan = (featureId: string, title = "fixture"): string =>
  `# Plan ${featureId}: ${title}\n`;

const writeFeatureRecord = async (
  repo: string,
  featureId: string,
  featureLoop: "managed" | "pre_loop" = "managed",
): Promise<void> => {
  const directory = join(repo, "model", "work", "features");
  await mkdir(directory, { recursive: true });
  await Bun.write(
    join(directory, `${featureId}.json`),
    `${JSON.stringify(
      {
        entities: [
          {
            id: `work.${featureId}`,
            kind: "work_item",
            name: `Feature ${featureId}`,
            summary: "Exercise canonical feature lifecycle custody.",
            status: "ready",
            tags: ["test"],
            attributes: {
              phase: "implementation",
              effort: 1,
              feature_id: featureId,
              feature_loop: featureLoop,
            },
          },
        ],
        relations: [],
      },
      null,
      2,
    )}\n`,
  );
};

interface FeatureFixture {
  readonly repo: string;
  readonly event: string;
  readonly base: string;
  readonly head: string;
}

const featureFixture = async (featureId = "0005-fixture"): Promise<FeatureFixture> => {
  const root = await temporaryRoot("semantic-feature-contract-");
  const repo = join(root, "repo");
  await mkdir(repo);
  expect(git(repo, "init").exitCode).toBe(0);
  await Bun.write(join(repo, "README.md"), "baseline\n");
  const base = commit(repo, "docs: establish fixture");
  for (const directory of ["design-specs", "plans", "scripts/accept"]) {
    await mkdir(join(repo, directory), { recursive: true });
  }
  await Bun.write(join(repo, "design-specs", `${featureId}.md`), completeDesignLens());
  await Bun.write(join(repo, "plans", `${featureId}.md`), featurePlan(featureId));
  await writeFeatureRecord(repo, featureId);
  const acceptance = join(repo, "scripts", "accept", `${featureId}.ts`);
  await Bun.write(acceptance, "#!/usr/bin/env bun\nconsole.log('fixture accepted');\n");
  await chmod(acceptance, 0o755);
  const head = commit(repo, "test: add feature fixture");
  const event = join(root, "event.json");
  await Bun.write(
    event,
    JSON.stringify({
      pull_request: {
        base: { sha: base },
        head: { sha: head },
        body: validPrBody(featureId),
      },
    }),
  );
  return { repo, event, base, head };
};

const runFeatureTool = (script: string, repo: string, ...args: ReadonlyArray<string>) =>
  run(["bun", script, "--root", repo, ...args], { cwd: repo });

describe("autonomous development control loop", () => {
  test("ships the validator, runner, executable acceptance, and one PR marker", async () => {
    expect(await Bun.file(FEATURE_POLICY).exists()).toBeTrue();
    expect(await Bun.file(FEATURE_RUNNER).exists()).toBeTrue();
    const acceptance = join(
      ROOT,
      "scripts",
      "accept",
      "0005-autonomous-development-control-loop.ts",
    );
    expect(await Bun.file(acceptance).exists()).toBeTrue();
    expect(run(["test", "-x", acceptance]).exitCode).toBe(0);
    const template = await Bun.file(join(ROOT, ".github", "PULL_REQUEST_TEMPLATE.md")).text();
    expect(template.match(/^Feature-ID:\s*.+$/gm)).toEqual(["Feature-ID: <NNNN-slug>"]);
  });

  test("accepts one complete feature contract", async () => {
    const fixture = await featureFixture();
    const result = runFeatureTool(FEATURE_POLICY, fixture.repo, "--event", fixture.event);
    expect(result.exitCode).toBe(0);
    expect(text(result)).toContain("0005-fixture");
  });

  test("requires the design lens on a changed contract but preserves an unchanged legacy contract", async () => {
    const fixture = await featureFixture();
    const design = join(fixture.repo, "design-specs", "0005-fixture.md");
    await Bun.write(design, "# historical legacy contract\n");
    const historicalBase = commit(fixture.repo, "docs: simulate accepted legacy contract");
    await Bun.write(
      join(fixture.repo, "plans", "0005-fixture.md"),
      featurePlan("0005-fixture", "continued legacy execution"),
    );
    const unchangedDesignHead = commit(fixture.repo, "plans: continue legacy feature");
    const payload = await Bun.file(fixture.event).json();
    payload.pull_request.base.sha = historicalBase;
    payload.pull_request.head.sha = unchangedDesignHead;
    await Bun.write(fixture.event, JSON.stringify(payload));
    const legacy = runFeatureTool(FEATURE_POLICY, fixture.repo, "--event", fixture.event);
    expect(legacy.exitCode).toBe(0);

    await Bun.write(design, "# changed contract without the required lens\n");
    await Bun.write(
      join(fixture.repo, "plans", "0005-fixture.md"),
      featurePlan("0005-fixture", "changed contract execution"),
    );
    payload.pull_request.base.sha = unchangedDesignHead;
    payload.pull_request.head.sha = commit(fixture.repo, "design: change legacy contract");
    await Bun.write(fixture.event, JSON.stringify(payload));
    const changed = runFeatureTool(FEATURE_POLICY, fixture.repo, "--event", fixture.event);
    expect(changed.exitCode).not.toBe(0);
    expect(text(changed)).toContain("design-lens shape");
  });

  for (const [label, body, reason] of [
    ["missing", "## Design spec and semantic claim\nmissing marker\n", "exactly one feature-id"],
    [
      "duplicate",
      `${validPrBody("0005-fixture")}\nFeature-ID: 0006-duplicate\n`,
      "exactly one feature-id",
    ],
    ["placeholder", validPrBody("<NNNN-slug>"), "malformed"],
  ] as const) {
    test(`rejects a ${label} feature marker`, async () => {
      const fixture = await featureFixture();
      const payload = await Bun.file(fixture.event).json();
      payload.pull_request.body = body;
      await Bun.write(fixture.event, JSON.stringify(payload));
      const result = runFeatureTool(FEATURE_POLICY, fixture.repo, "--event", fixture.event);
      expect(result.exitCode).not.toBe(0);
      expect(text(result).toLowerCase()).toContain(reason);
    });
  }

  test("rejects placeholder-only report sections and non-executable acceptance", async () => {
    const fixture = await featureFixture();
    const payload = await Bun.file(fixture.event).json();
    payload.pull_request.body = validPrBody("0005-fixture").replace(
      "## Semantic diff\nThe fixture adds one bounded process feature.",
      "## Semantic diff\n<!-- placeholder -->",
    );
    await Bun.write(fixture.event, JSON.stringify(payload));
    const empty = runFeatureTool(FEATURE_POLICY, fixture.repo, "--event", fixture.event);
    expect(empty.exitCode).not.toBe(0);
    expect(text(empty).toLowerCase()).toContain("semantic diff");

    payload.pull_request.body = validPrBody("0005-fixture");
    await Bun.write(fixture.event, JSON.stringify(payload));
    const acceptance = join(fixture.repo, "scripts", "accept", "0005-fixture.ts");
    await Bun.spawn(["chmod", "0644", acceptance]).exited;
    const mode = runFeatureTool(FEATURE_POLICY, fixture.repo, "--event", fixture.event);
    expect(mode.exitCode).not.toBe(0);
    expect(text(mode).toLowerCase()).toContain("executable");
  });

  test("requires the selected feature in the PR range and rejects multiple feature IDs", async () => {
    const fixture = await featureFixture();
    await Bun.write(join(fixture.repo, "README.md"), "maintenance\n");
    const maintenance = commit(fixture.repo, "docs: maintenance only");
    const payload = await Bun.file(fixture.event).json();
    payload.pull_request.base.sha = fixture.head;
    payload.pull_request.head.sha = maintenance;
    await Bun.write(fixture.event, JSON.stringify(payload));
    const missingFeature = runFeatureTool(FEATURE_POLICY, fixture.repo, "--event", fixture.event);
    expect(missingFeature.exitCode).not.toBe(0);
    expect(text(missingFeature).toLowerCase()).toContain("did not change");

    await Bun.write(join(fixture.repo, "design-specs", "0006-second.md"), "# second\n");
    await Bun.write(
      join(fixture.repo, "plans", "0006-second.md"),
      featurePlan("0006-second", "second feature"),
    );
    await writeFeatureRecord(fixture.repo, "0006-second");
    const second = join(fixture.repo, "scripts", "accept", "0006-second.ts");
    await Bun.write(second, "#!/usr/bin/env bun\nprocess.exit(0);\n");
    await Bun.spawn(["chmod", "+x", second]).exited;
    payload.pull_request.base.sha = fixture.base;
    payload.pull_request.head.sha = commit(fixture.repo, "feat: second feature");
    await Bun.write(fixture.event, JSON.stringify(payload));
    const multiple = runFeatureTool(FEATURE_POLICY, fixture.repo, "--event", fixture.event);
    expect(multiple.exitCode).not.toBe(0);
    expect(text(multiple).toLowerCase()).toContain("multiple feature identities");
  });

  test("selects a feature from a model-only lifecycle transition", async () => {
    const fixture = await featureFixture();
    const modelPath = join(fixture.repo, "model", "work", "features", "0005-fixture.json");
    const model = (await Bun.file(modelPath).json()) as {
      entities: Array<{ status: string }>;
    };
    const entity = model.entities[0];
    if (entity === undefined) throw new Error("fixture feature entity is missing");
    entity.status = "in_progress";
    await Bun.write(modelPath, `${JSON.stringify(model, null, 2)}\n`);
    const head = commit(fixture.repo, "feat: begin fixture execution");
    const payload = await Bun.file(fixture.event).json();
    payload.pull_request.base.sha = fixture.head;
    payload.pull_request.head.sha = head;
    await Bun.write(fixture.event, JSON.stringify(payload));

    const selected = runFeatureTool(FEATURE_POLICY, fixture.repo, "--event", fixture.event);
    expect(selected.exitCode).toBe(0);
    expect(text(selected)).toContain("0005-fixture");

    const replay = runFeatureTool(
      FEATURE_RUNNER,
      fixture.repo,
      "--mode",
      "range",
      "--base",
      fixture.head,
      "--head",
      head,
    );
    expect(replay.exitCode).toBe(0);
    expect(text(replay)).toContain("fixture accepted");
  });

  test("allows only exact frozen contract migrations and replays their owner", async () => {
    const fixture = await featureFixture();
    const ownerDesign = join(fixture.repo, "design-specs", "0005-fixture.md");
    await Bun.write(
      ownerDesign,
      `${await Bun.file(ownerDesign).text()}\nMigrates-Feature-IDs: 0006-carrier\n`,
    );
    await Bun.write(
      join(fixture.repo, "design-specs", "0006-carrier.md"),
      completeDesignLens("migrated carrier"),
    );
    await Bun.write(
      join(fixture.repo, "plans", "0006-carrier.md"),
      featurePlan("0006-carrier", "migration carrier"),
    );
    await writeFeatureRecord(fixture.repo, "0006-carrier");
    const migrated = join(fixture.repo, "scripts", "accept", "0006-carrier.ts");
    await Bun.write(migrated, "#!/usr/bin/env bun\nprocess.exit(29);\n");
    await Bun.spawn(["chmod", "+x", migrated]).exited;
    const head = commit(fixture.repo, "refactor: migrate carrier");
    const payload = await Bun.file(fixture.event).json();
    payload.pull_request.head.sha = head;
    await Bun.write(fixture.event, JSON.stringify(payload));

    const validated = runFeatureTool(FEATURE_POLICY, fixture.repo, "--event", fixture.event);
    expect(validated.exitCode).toBe(0);
    expect(text(validated)).toContain("0006-carrier");

    const replay = runFeatureTool(
      FEATURE_RUNNER,
      fixture.repo,
      "--mode",
      "range",
      "--base",
      fixture.base,
      "--head",
      head,
    );
    expect(replay.exitCode).toBe(0);
    expect(text(replay)).toContain("contract migrations owned by 0005-fixture");
    expect(text(replay)).toContain("fixture accepted");
  });

  test("rejects duplicate owners for one changed contract migration", async () => {
    const fixture = await featureFixture();
    const ownerDesign = join(fixture.repo, "design-specs", "0005-fixture.md");
    await Bun.write(
      ownerDesign,
      `${await Bun.file(ownerDesign).text()}\nMigrates-Feature-IDs: 0006-carrier\n`,
    );
    for (const [featureId, design] of [
      ["0006-carrier", completeDesignLens("migrated carrier")],
      [
        "0007-second-owner",
        `${completeDesignLens("second owner")}\nMigrates-Feature-IDs: 0006-carrier\n`,
      ],
    ] as const) {
      await Bun.write(join(fixture.repo, "design-specs", `${featureId}.md`), design);
      await Bun.write(
        join(fixture.repo, "plans", `${featureId}.md`),
        featurePlan(featureId, "migration"),
      );
      await writeFeatureRecord(fixture.repo, featureId);
      const acceptance = join(fixture.repo, "scripts", "accept", `${featureId}.ts`);
      await Bun.write(acceptance, "#!/usr/bin/env bun\nprocess.exit(0);\n");
      await chmod(acceptance, 0o755);
    }
    const head = commit(fixture.repo, "refactor: create duplicate migration ownership");

    const replay = runFeatureTool(
      FEATURE_RUNNER,
      fixture.repo,
      "--mode",
      "range",
      "--base",
      fixture.base,
      "--head",
      head,
    );
    expect(replay.exitCode).not.toBe(0);
    expect(text(replay).toLowerCase()).toContain("ambiguous");
    expect(text(replay)).toContain("0006-carrier");
  });

  test("rejects cyclic ownership between changed contract migrations", async () => {
    const fixture = await featureFixture();
    const ownerDesign = join(fixture.repo, "design-specs", "0005-fixture.md");
    await Bun.write(
      ownerDesign,
      `${await Bun.file(ownerDesign).text()}\nMigrates-Feature-IDs: 0006-carrier\n`,
    );
    await Bun.write(
      join(fixture.repo, "design-specs", "0006-carrier.md"),
      `${completeDesignLens("cyclic carrier")}\nMigrates-Feature-IDs: 0005-fixture\n`,
    );
    await Bun.write(
      join(fixture.repo, "plans", "0006-carrier.md"),
      featurePlan("0006-carrier", "cyclic migration"),
    );
    await writeFeatureRecord(fixture.repo, "0006-carrier");
    const acceptance = join(fixture.repo, "scripts", "accept", "0006-carrier.ts");
    await Bun.write(acceptance, "#!/usr/bin/env bun\nprocess.exit(0);\n");
    await chmod(acceptance, 0o755);
    const head = commit(fixture.repo, "refactor: create cyclic migration ownership");

    const replay = runFeatureTool(
      FEATURE_RUNNER,
      fixture.repo,
      "--mode",
      "range",
      "--base",
      fixture.base,
      "--head",
      head,
    );
    expect(replay.exitCode).not.toBe(0);
    expect(text(replay).toLowerCase()).toContain("cyclic");
  });

  test("rejects a changed migrated design without the open-system lens", async () => {
    const fixture = await featureFixture();
    const ownerDesign = join(fixture.repo, "design-specs", "0005-fixture.md");
    await Bun.write(
      ownerDesign,
      `${await Bun.file(ownerDesign).text()}\nMigrates-Feature-IDs: 0006-carrier\n`,
    );
    await Bun.write(
      join(fixture.repo, "design-specs", "0006-carrier.md"),
      "# migrated contract without lens\n",
    );
    await Bun.write(
      join(fixture.repo, "plans", "0006-carrier.md"),
      featurePlan("0006-carrier", "migration carrier"),
    );
    await writeFeatureRecord(fixture.repo, "0006-carrier");
    const migrated = join(fixture.repo, "scripts", "accept", "0006-carrier.ts");
    await Bun.write(migrated, "#!/usr/bin/env bun\nprocess.exit(0);\n");
    await Bun.spawn(["chmod", "+x", migrated]).exited;
    const payload = await Bun.file(fixture.event).json();
    payload.pull_request.head.sha = commit(fixture.repo, "refactor: migrate malformed carrier");
    await Bun.write(fixture.event, JSON.stringify(payload));

    const result = runFeatureTool(FEATURE_POLICY, fixture.repo, "--event", fixture.event);
    expect(result.exitCode).not.toBe(0);
    expect(text(result)).toContain("design-specs/0006-carrier.md");
    expect(text(result)).toContain("design-lens shape");
  });

  test("does not let an unchanged migration declaration own a later range", async () => {
    const fixture = await featureFixture();
    const ownerDesign = join(fixture.repo, "design-specs", "0005-fixture.md");
    await Bun.write(
      ownerDesign,
      `${await Bun.file(ownerDesign).text()}\nMigrates-Feature-IDs: 0006-carrier\n`,
    );
    await Bun.write(
      join(fixture.repo, "design-specs", "0006-carrier.md"),
      completeDesignLens("migrated carrier"),
    );
    await Bun.write(
      join(fixture.repo, "plans", "0006-carrier.md"),
      featurePlan("0006-carrier", "migration carrier"),
    );
    await writeFeatureRecord(fixture.repo, "0006-carrier");
    const migrated = join(fixture.repo, "scripts", "accept", "0006-carrier.ts");
    await Bun.write(migrated, "#!/usr/bin/env bun\nprocess.exit(0);\n");
    await Bun.spawn(["chmod", "+x", migrated]).exited;
    const migrationHead = commit(fixture.repo, "refactor: migrate carrier");

    await Bun.write(
      join(fixture.repo, "plans", "0005-fixture.md"),
      featurePlan("0005-fixture", "later owner change"),
    );
    await Bun.write(
      join(fixture.repo, "plans", "0006-carrier.md"),
      featurePlan("0006-carrier", "later carrier change"),
    );
    const laterHead = commit(fixture.repo, "refactor: change both features later");
    const payload = await Bun.file(fixture.event).json();
    payload.pull_request.base.sha = migrationHead;
    payload.pull_request.head.sha = laterHead;
    await Bun.write(fixture.event, JSON.stringify(payload));

    const validated = runFeatureTool(FEATURE_POLICY, fixture.repo, "--event", fixture.event);
    expect(validated.exitCode).not.toBe(0);
    expect(text(validated).toLowerCase()).toContain("multiple feature identities");

    const replay = runFeatureTool(
      FEATURE_RUNNER,
      fixture.repo,
      "--mode",
      "range",
      "--base",
      migrationHead,
      "--head",
      laterHead,
    );
    expect(replay.exitCode).toBe(0);
    expect(text(replay)).toContain("0005-fixture");
    expect(text(replay)).toContain("0006-carrier");
  });

  test("allows trivial README maintenance but rejects implementation changes", async () => {
    const fixture = await featureFixture();
    await Bun.write(join(fixture.repo, "README.md"), "trivial correction\n");
    const trivialHead = commit(fixture.repo, "docs: adjust readme");
    const payload = {
      pull_request: {
        base: { sha: fixture.head },
        head: { sha: trivialHead },
        body: validPrBody("trivial"),
      },
    };
    await Bun.write(fixture.event, JSON.stringify(payload));
    expect(runFeatureTool(FEATURE_POLICY, fixture.repo, "--event", fixture.event).exitCode).toBe(0);

    await mkdir(join(fixture.repo, "src"));
    await Bun.write(join(fixture.repo, "src", "semantic.ts"), "export const meaning = 1;\n");
    payload.pull_request.head.sha = commit(fixture.repo, "feat: add implementation");
    await Bun.write(fixture.event, JSON.stringify(payload));
    const rejected = runFeatureTool(FEATURE_POLICY, fixture.repo, "--event", fixture.event);
    expect(rejected.exitCode).not.toBe(0);
    expect(text(rejected).toLowerCase()).toContain("trivial");
  });

  test("trivial classification observes deletions and rename/copy origins", async () => {
    const deleted = await featureFixture();
    await mkdir(join(deleted.repo, "src"));
    const implementation = join(deleted.repo, "src", "semantic.ts");
    await Bun.write(implementation, "export const meaning = 1;\n");
    const implementationHead = commit(deleted.repo, "feat: add implementation");
    await rm(implementation);
    const deletionHead = commit(deleted.repo, "chore: delete implementation");
    await Bun.write(
      deleted.event,
      JSON.stringify({
        pull_request: {
          base: { sha: implementationHead },
          head: { sha: deletionHead },
          body: validPrBody("trivial"),
        },
      }),
    );
    const deletion = runFeatureTool(FEATURE_POLICY, deleted.repo, "--event", deleted.event);
    expect(deletion.exitCode).not.toBe(0);
    expect(text(deletion)).toContain("src/semantic.ts");

    const renamed = await featureFixture();
    const policy = join(renamed.repo, "CONTRIBUTING.md");
    await Bun.write(policy, "nontrivial contributor policy\n".repeat(20));
    const policyHead = commit(renamed.repo, "docs: add contributor policy");
    await mkdir(join(renamed.repo, "generated"));
    expect(git(renamed.repo, "mv", "CONTRIBUTING.md", "generated/CONTRIBUTING.md").exitCode).toBe(
      0,
    );
    const renameHead = commit(renamed.repo, "chore: move policy into generated");
    await Bun.write(
      renamed.event,
      JSON.stringify({
        pull_request: {
          base: { sha: policyHead },
          head: { sha: renameHead },
          body: validPrBody("trivial"),
        },
      }),
    );
    const rename = runFeatureTool(FEATURE_POLICY, renamed.repo, "--event", renamed.event);
    expect(rename.exitCode).not.toBe(0);
    expect(text(rename)).toContain("CONTRIBUTING.md");

    const copied = await featureFixture();
    const copiedPolicy = join(copied.repo, "CONTRIBUTING.md");
    await Bun.write(copiedPolicy, "nontrivial contributor policy\n".repeat(20));
    const copiedPolicyHead = commit(copied.repo, "docs: add contributor policy");
    await mkdir(join(copied.repo, "generated"));
    await cp(copiedPolicy, join(copied.repo, "generated", "CONTRIBUTING.md"));
    const copyHead = commit(copied.repo, "chore: copy policy into generated");
    await Bun.write(
      copied.event,
      JSON.stringify({
        pull_request: {
          base: { sha: copiedPolicyHead },
          head: { sha: copyHead },
          body: validPrBody("trivial"),
        },
      }),
    );
    const copy = runFeatureTool(FEATURE_POLICY, copied.repo, "--event", copied.event);
    expect(copy.exitCode).not.toBe(0);
    expect(text(copy)).toContain("CONTRIBUTING.md");
  });

  test("dispatches runnable work, reports pre-loop work, and rejects orphan scripts", async () => {
    const fixture = await featureFixture();
    const pr = runFeatureTool(
      FEATURE_RUNNER,
      fixture.repo,
      "--mode",
      "pr",
      "--event",
      fixture.event,
    );
    expect(pr.exitCode).toBe(0);
    expect(text(pr)).toContain("fixture accepted");
    const ranged = runFeatureTool(
      FEATURE_RUNNER,
      fixture.repo,
      "--mode",
      "range",
      "--base",
      fixture.base,
      "--head",
      fixture.head,
    );
    expect(ranged.exitCode).toBe(0);
    expect(text(ranged)).toContain("0005-fixture");

    const preLoopId = "0001-inventory-resolution-tracer";
    await Bun.write(join(fixture.repo, "design-specs", `${preLoopId}.md`), "# historical\n");
    await Bun.write(
      join(fixture.repo, "plans", `${preLoopId}.md`),
      featurePlan(preLoopId, "historical"),
    );
    await writeFeatureRecord(fixture.repo, preLoopId, "pre_loop");

    const supersededId = "0020-lossless-kernel-source";
    await Bun.write(join(fixture.repo, "design-specs", `${supersededId}.md`), "# superseded\n");
    await Bun.write(
      join(fixture.repo, "plans", `${supersededId}.md`),
      featurePlan(supersededId, "source contract"),
    );
    await writeFeatureRecord(fixture.repo, supersededId);
    const supersededPath = join(fixture.repo, "model", "work", "features", `${supersededId}.json`);
    const superseded = (await Bun.file(supersededPath).json()) as {
      entities: Array<{
        status: string;
        attributes: Record<string, unknown>;
      }>;
    };
    const supersededEntity = superseded.entities[0];
    if (supersededEntity === undefined) throw new Error("fixture feature entity is missing");
    supersededEntity.status = "superseded";
    supersededEntity.attributes.replacement = {
      target: "0005-fixture",
      reason: "the stable agent-facing contract replaced this source contract",
    };
    await Bun.write(supersededPath, `${JSON.stringify(superseded, null, 2)}\n`);
    const release = runFeatureTool(FEATURE_RUNNER, fixture.repo, "--mode", "release");
    if (release.exitCode !== 0) throw new Error(text(release));
    expect(release.exitCode).toBe(0);
    expect(text(release)).toContain("runnable=1");
    expect(text(release)).toContain("non-runnable=2");
    expect(text(release)).toContain("superseded by 0005-fixture");
    expect(text(release)).not.toContain("[object Object]");
    expect(text(release)).toContain("failed=0");

    const red = join(fixture.repo, "scripts", "accept", "0006-red.ts");
    await Bun.write(red, "#!/usr/bin/env bun\nprocess.exit(23);\n");
    await chmod(red, 0o755);
    const orphaned = runFeatureTool(FEATURE_RUNNER, fixture.repo, "--mode", "release");
    expect(orphaned.exitCode).not.toBe(0);
    expect(text(orphaned).toLowerCase()).toContain("orphan");
    expect(text(orphaned)).toContain("0006-red");
  });

  test("release runs the complete canonical set before reporting failed programs", async () => {
    const fixture = await featureFixture();
    for (const [featureId, body] of [
      ["0006-red", "#!/usr/bin/env bun\nprocess.exit(23);\n"],
      ["0007-green", "#!/usr/bin/env bun\nconsole.log('green acceptance ran');\n"],
    ] as const) {
      await Bun.write(
        join(fixture.repo, "design-specs", `${featureId}.md`),
        completeDesignLens(featureId),
      );
      await Bun.write(join(fixture.repo, "plans", `${featureId}.md`), featurePlan(featureId));
      await writeFeatureRecord(fixture.repo, featureId);
      const acceptance = join(fixture.repo, "scripts", "accept", `${featureId}.ts`);
      await Bun.write(acceptance, body);
      await chmod(acceptance, 0o755);
    }

    const release = runFeatureTool(FEATURE_RUNNER, fixture.repo, "--mode", "release");
    expect(release.exitCode).not.toBe(0);
    expect(text(release)).toContain("green acceptance ran");
    expect(text(release)).toContain("runnable=3");
    expect(text(release)).toContain("non-runnable=0");
    expect(text(release)).toContain("failed=1");
  });

  test("direct acceptance dispatch rejects shell-shaped feature input", async () => {
    const fixture = await featureFixture();
    const injected = runFeatureTool(
      FEATURE_RUNNER,
      fixture.repo,
      "--mode",
      "direct",
      "--feature",
      "0005-fixture; true #",
    );
    expect(injected.exitCode).not.toBe(0);
    expect(text(injected).toLowerCase()).toContain("well-formed");
  });

  test("range replay rejects nontrivial zero-plan and removed-plan changes", async () => {
    const zeroPlan = await featureFixture();
    await mkdir(join(zeroPlan.repo, "src"));
    await Bun.write(join(zeroPlan.repo, "src", "bypass.ts"), "export const bypass = true;\n");
    const bypassHead = commit(zeroPlan.repo, "feat: bypass feature authority");
    const bypass = runFeatureTool(
      FEATURE_RUNNER,
      zeroPlan.repo,
      "--mode",
      "range",
      "--base",
      zeroPlan.head,
      "--head",
      bypassHead,
    );
    expect(bypass.exitCode).not.toBe(0);
    expect(text(bypass)).toContain("src/bypass.ts");

    const deleted = await featureFixture();
    await rm(join(deleted.repo, "plans", "0005-fixture.md"));
    const deletedHead = commit(deleted.repo, "chore: delete feature plan");
    const deletedPlan = runFeatureTool(
      FEATURE_RUNNER,
      deleted.repo,
      "--mode",
      "range",
      "--base",
      deleted.head,
      "--head",
      deletedHead,
    );
    expect(deletedPlan.exitCode).not.toBe(0);
    expect(text(deletedPlan)).toContain("0005-fixture");

    const renamed = await featureFixture();
    await mkdir(join(renamed.repo, "generated"));
    expect(
      git(renamed.repo, "mv", "plans/0005-fixture.md", "generated/0005-fixture-plan.md").exitCode,
    ).toBe(0);
    const renamedHead = commit(renamed.repo, "chore: move feature plan into generated");
    const renamedPlan = runFeatureTool(
      FEATURE_RUNNER,
      renamed.repo,
      "--mode",
      "range",
      "--base",
      renamed.head,
      "--head",
      renamedHead,
    );
    expect(renamedPlan.exitCode).not.toBe(0);
    expect(text(renamedPlan)).toContain("0005-fixture");
  });

  test("detects stale generated views through the Bun project model", async () => {
    const root = await temporaryRoot("semantic-generated-drift-");
    for (const directory of ["model", "generated", "design-specs", "plans"]) {
      await cp(join(ROOT, directory), join(root, directory), { recursive: true });
    }
    await mkdir(join(root, "scripts"), { recursive: true });
    await cp(join(ROOT, "scripts", "accept"), join(root, "scripts", "accept"), {
      recursive: true,
    });
    const generated = join(root, "generated", "README.md");
    await Bun.write(generated, `${await Bun.file(generated).text()}\nstale drift\n`);
    const result = run(["bun", "run", "semproj", "--", "--root", root, "generate", "--check"], {
      cwd: ROOT,
    });
    expect(result.exitCode).not.toBe(0);
    expect(text(result).toLowerCase()).toContain("stale");
  });

  test("binds CI to exact heads, pinned runtimes, and hardened transitions", async () => {
    const workflow = await Bun.file(WORKFLOW).text();
    for (const observation of [
      "github.event.pull_request.head.sha",
      "exact-head:",
      'test "${EXACT_HEAD}" = "$(git rev-parse HEAD)"',
      "persist-credentials: false",
      "runs-on: ubuntu-24.04",
      "bun-version: 1.3.13",
      "run-feature-acceptance.ts",
      "merge_group:",
      "release:",
      "schedule:",
      "workflow_dispatch:",
      "tracked artifacts changed during verification",
    ]) {
      expect(workflow).toContain(observation);
    }
    expect(workflow).not.toContain("pull_request_target");
  });

  test("commit policy conformance is green and detects materialized drift", async () => {
    const green = run(["bun", "run", COMMIT_POLICY]);
    expect(green.exitCode).toBe(0);
    const provenance = await Bun.file(PROVENANCE).json();
    expect(provenance.block.digest).toBe(
      "sha256:f75a4a63e677b8bc6c10f90858aa18d75d84bed0e424949642dc13424ec402f1",
    );

    const root = await temporaryRoot("semantic-commit-policy-");
    for (const path of [".githooks", "config", "scripts", "commitlint.config.ts", "package.json"]) {
      await cp(join(ROOT, path), join(root, path), { recursive: true });
    }
    const hook = join(root, ".githooks", "commit-msg");
    await Bun.write(hook, `${await Bun.file(hook).text()}\n# drift\n`);
    const drift = run(["bun", "run", "scripts/check-commit-policy.ts"], { cwd: root });
    expect(drift.exitCode).not.toBe(0);
    expect(text(drift).toLowerCase()).toContain("drifted");
  });

  test("commit policy rejects executable-mode and provenance-authority drift", async () => {
    const modeRoot = await temporaryRoot("semantic-commit-mode-");
    for (const path of [".githooks", "config", "scripts", "commitlint.config.ts", "package.json"]) {
      await cp(join(ROOT, path), join(modeRoot, path), { recursive: true });
    }
    await chmod(join(modeRoot, ".githooks", "commit-msg"), 0o644);
    const mode = run(["bun", "run", "scripts/check-commit-policy.ts"], { cwd: modeRoot });
    expect(mode.exitCode).not.toBe(0);
    expect(text(mode).toLowerCase()).toContain("executable");

    const provenanceRoot = await temporaryRoot("semantic-commit-provenance-");
    for (const path of [".githooks", "config", "scripts", "commitlint.config.ts", "package.json"]) {
      await cp(join(ROOT, path), join(provenanceRoot, path), { recursive: true });
    }
    const provenancePath = join(
      provenanceRoot,
      "config",
      "clamor-blocks",
      "conventional-commits.provenance.json",
    );
    const malformed = await Bun.file(provenancePath).json();
    malformed.upstream.commit = "not-a-commit";
    await Bun.write(provenancePath, JSON.stringify(malformed));
    const provenance = run(["bun", "run", "scripts/check-commit-policy.ts"], {
      cwd: provenanceRoot,
    });
    expect(provenance.exitCode).not.toBe(0);
    expect(text(provenance).toLowerCase()).toContain("upstream");
  });

  test("pre-push removes repository-local Git state before entering Nix", async () => {
    const root = await temporaryRoot("semantic-hook-environment-");
    const repository = join(root, "outer");
    const fakeBin = join(root, "bin");
    await mkdir(repository);
    await mkdir(fakeBin);
    expect(git(repository, "init", "-q").exitCode).toBe(0);
    const capture = join(root, "environment.txt");
    const argumentsCapture = join(root, "arguments.txt");
    const fakeNix = join(fakeBin, "nix");
    await Bun.write(
      fakeNix,
      `#!/usr/bin/env bun
await Bun.write(process.env.CAPTURE_ARGS!, Bun.argv.slice(2).join("\\n"));
await Bun.write(
  process.env.CAPTURE_ENV!,
  Object.entries(process.env).map(([key, value]) => \`\${key}=\${value}\\n\`).join(""),
);
`,
    );
    await chmod(fakeNix, 0o755);
    const gitDirectory = join(repository, ".git");
    const result = run([join(ROOT, ".githooks", "pre-push")], {
      cwd: repository,
      env: {
        ...process.env,
        PATH: `${fakeBin}:${process.env.PATH ?? ""}`,
        CAPTURE_ARGS: argumentsCapture,
        CAPTURE_ENV: capture,
        GIT_DIR: gitDirectory,
        GIT_WORK_TREE: repository,
        GIT_INDEX_FILE: join(gitDirectory, "index"),
      },
    });
    expect(result.exitCode).toBe(0);
    expect(await Bun.file(argumentsCapture).text()).toBe(
      "develop\n--command\nbun\nscripts/check.ts",
    );
    const captured = await Bun.file(capture).text();
    for (const variable of ["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE"]) {
      expect(captured).not.toContain(`${variable}=`);
    }
  });

  test("fresh-checkout setup installs advisory hooks", async () => {
    const root = await temporaryRoot("semantic-hook-install-");
    const repository = join(root, "repo");
    await mkdir(join(repository, "scripts"), { recursive: true });
    await cp(
      join(ROOT, "scripts", "install-git-hooks.ts"),
      join(repository, "scripts", "install-git-hooks.ts"),
    );
    expect(git(repository, "init", "-q").exitCode).toBe(0);
    const result = run(["bun", "scripts/install-git-hooks.ts"], { cwd: repository });
    expect(result.exitCode).toBe(0);
    expect(git(repository, "config", "--get", "core.hooksPath").stdout.toString().trim()).toBe(
      ".githooks",
    );
    const contributing = await Bun.file(join(ROOT, "CONTRIBUTING.md")).text();
    const install = "bun install --frozen-lockfile --ignore-scripts";
    const hooks = "bun run hooks:install";
    expect(contributing.indexOf(install)).toBeGreaterThanOrEqual(0);
    expect(contributing.indexOf(hooks)).toBeGreaterThan(contributing.indexOf(install));
  });

  test("active gates fail closed and Nix filters noncanonical roots", async () => {
    const fast = await Bun.file(join(ROOT, "scripts", "check-fast.ts")).text();
    const integration = await Bun.file(join(ROOT, "scripts", "check.ts")).text();
    expect(fast).toContain("required tool");
    expect(fast).toContain("node_modules");
    expect(fast).toContain("actionlint");
    expect(fast).toContain('"just"');
    expect(integration.indexOf('"install"')).toBeLessThan(
      integration.indexOf("scripts/check-fast.ts"),
    );
    const flake = await Bun.file(join(ROOT, "flake.nix")).text();
    for (const directory of [
      "node_modules",
      ".git",
      ".references",
      ".research-cache",
      ".venv",
      ".pyright",
      ".pytest_cache",
      ".ruff_cache",
      "build",
      "dist",
    ]) {
      expect(flake).toContain(`name == "${directory}"`);
    }
  });

  test("uses Just over typed Bun entrypoints and owns no shell program", async () => {
    const justfile = await Bun.file(join(ROOT, "justfile")).text();
    for (const command of [
      "bun scripts/check-fast.ts",
      "bun scripts/check.ts",
      "bun scripts/check-references.ts",
      'bun scripts/run-feature-acceptance.ts --mode direct --feature "$1"',
    ]) {
      expect(justfile).toContain(command);
    }
    const shellPrograms: string[] = [];
    for (const directory of ["scripts", ".githooks"]) {
      const glob = new Bun.Glob("**/*");
      for await (const path of glob.scan({ cwd: join(ROOT, directory), onlyFiles: true })) {
        const firstLine = (await Bun.file(join(ROOT, directory, path)).text()).split("\n", 1)[0];
        if (path.endsWith(".sh") || /^#!.*\b(?:ba|z|da|k)?sh\b/.test(firstLine ?? "")) {
          shellPrograms.push(`${directory}/${path}`);
        }
      }
    }
    expect(shellPrograms).toEqual([]);
  });
});
