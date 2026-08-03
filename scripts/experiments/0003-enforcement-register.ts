#!/usr/bin/env bun
import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { Console, Data, Effect } from "effect";
import { runMain } from "../lib/command.ts";

class ExperimentFailure extends Data.TaggedError("ExperimentFailure")<{
  readonly message: string;
}> {}

type CommandResult = {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
};

type GateScenario = {
  readonly id: string;
  readonly command: ReadonlyArray<string>;
  readonly target: string;
  readonly seed: string;
  readonly markers: ReadonlyArray<string>;
};

type StableIdentityAudit = {
  readonly generatedFiles: number;
  readonly lockSources: number;
  readonly positionalFields: ReadonlyArray<string>;
};

const root = resolve(import.meta.dirname, "../..");
const decoder = new TextDecoder();
const IGNORED_ROOTS: Readonly<Record<string, true>> = Object.freeze({
  ".git": true,
  ".omp": true,
  ".references": true,
  ".research-cache": true,
  node_modules: true,
});
const POSITIONAL_FIELD_NAMES: Readonly<Record<string, true>> = Object.freeze({
  address: true,
  byte_offset: true,
  line: true,
  line_number: true,
  offset: true,
  ordinal: true,
  position: true,
  source_offset: true,
  span: true,
});
const POSITIONAL_ASSIGNMENT =
  /(?:^|[|`"'\s])(?:address|byte_offset|line|line_number|offset|ordinal|position|source_offset|span)(?:[|`"'\s]|\b)\s*[:=]/iu;

const scenarios: ReadonlyArray<GateScenario> = [
  {
    id: "format",
    command: ["bun", "run", "format:check"],
    target: "src/project-model/rx4-unformatted.ts",
    seed: "export const rx4Unformatted={value:1};\n",
    markers: ["rx4-unformatted.ts"],
  },
  {
    id: "lint-warning",
    command: ["bun", "run", "lint"],
    target: "src/project-model/rx4-lint-warning.ts",
    seed: "// oxlint-disable-next-line eqeqeq\nexport const rx4LintWarning = 1;\n",
    markers: ["rx4-lint-warning.ts", "warning"],
  },
  {
    id: "invalid-model",
    command: ["bun", "run", "semproj", "--", "validate"],
    target: "model/rx4-invalid.json",
    seed: `${JSON.stringify(
      {
        entities: [
          {
            id: "rx4.invalid-work",
            kind: "work_item",
            name: "RX4 invalid work fixture",
            status: "in_progress",
            tags: ["rx4"],
            attributes: { phase: "rx4-invalid-phase", acceptance: ["fixture"], delegation: {} },
          },
        ],
        relations: [],
      },
      null,
      2,
    )}\n`,
    markers: ["work.phase", ": 1 error(s)"],
  },
  {
    id: "generated-view-drift",
    command: ["bun", "run", "semproj", "--", "generate", "--check"],
    target: "generated/README.md",
    seed: "\nRX4 seeded generated-view drift\n",
    markers: ["generated projections are stale", "generated/README.md"],
  },
];

const ensure = (condition: boolean, message: string): Effect.Effect<void, ExperimentFailure> =>
  condition ? Effect.void : Effect.fail(new ExperimentFailure({ message }));

const runCommand = (
  cwd: string,
  command: ReadonlyArray<string>,
  env: Record<string, string | undefined>,
): Effect.Effect<CommandResult, ExperimentFailure> =>
  Effect.try({
    try: () => {
      const result = Bun.spawnSync({
        cmd: [...command],
        cwd,
        env,
        stdin: "ignore",
        stdout: "pipe",
        stderr: "pipe",
      });
      return {
        exitCode: result.exitCode,
        stdout: decoder.decode(result.stdout),
        stderr: decoder.decode(result.stderr),
      };
    },
    catch: (cause) =>
      new ExperimentFailure({
        message: `cannot run ${command.join(" ")}: ${cause instanceof Error ? cause.message : String(cause)}`,
      }),
  });

const walkFiles = (
  directory: string,
  skipIgnored: boolean,
): Effect.Effect<ReadonlyArray<string>, ExperimentFailure> =>
  Effect.tryPromise({
    try: async () => {
      const files: string[] = [];
      const walk = async (current: string): Promise<void> => {
        const entries = await readdir(current, { withFileTypes: true });
        entries.sort((left, right) => left.name.localeCompare(right.name));
        for (const entry of entries) {
          if (skipIgnored && IGNORED_ROOTS[entry.name] === true) continue;
          const path = join(current, entry.name);
          if (entry.isDirectory()) await walk(path);
          else if (entry.isFile()) files.push(path);
          else throw new Error(`unsupported repository entry ${path}`);
        }
      };
      await walk(directory);
      return files;
    },
    catch: (cause) =>
      new ExperimentFailure({
        message: `cannot enumerate ${directory}: ${cause instanceof Error ? cause.message : String(cause)}`,
      }),
  });

const digestFiles = (
  directory: string,
  files: ReadonlyArray<string>,
): Effect.Effect<string, ExperimentFailure> =>
  Effect.tryPromise({
    try: async () => {
      const hash = createHash("sha256");
      for (const file of files) {
        hash
          .update(relative(directory, file))
          .update("\0")
          .update(await readFile(file))
          .update("\0");
      }
      return `sha256:${hash.digest("hex")}`;
    },
    catch: (cause) =>
      new ExperimentFailure({
        message: `cannot digest ${directory}: ${cause instanceof Error ? cause.message : String(cause)}`,
      }),
  });

const repositoryDigest = (): Effect.Effect<string, ExperimentFailure> =>
  walkFiles(root, true).pipe(Effect.flatMap((files) => digestFiles(root, files)));

const mkdirIfNeeded = async (path: string): Promise<void> => {
  await mkdir(path, { recursive: true });
};

const copyFixtureRepository = (destination: string): Effect.Effect<void, ExperimentFailure> =>
  Effect.tryPromise({
    try: async () => {
      await mkdirIfNeeded(destination);
      for (const path of [
        ".omp",
        ".oxfmtrc.json",
        ".oxlintrc.json",
        "apps",
        "commitlint.config.ts",
        "config",
        "design-specs",
        "generated",
        "model",
        "package.json",
        "plans",
        "references",
        "research",
        "scripts",
        "src",
        "tests",
        "tsconfig.json",
      ]) {
        await cp(resolve(root, path), resolve(destination, path), { recursive: true });
      }
      await symlink(resolve(root, "node_modules"), resolve(destination, "node_modules"), "dir");
    },
    catch: (cause) =>
      new ExperimentFailure({
        message: `cannot prepare RX4 fixture repository: ${cause instanceof Error ? cause.message : String(cause)}`,
      }),
  });

const seedScenario = (
  fixtureRoot: string,
  scenario: GateScenario,
): Effect.Effect<void, ExperimentFailure> =>
  Effect.tryPromise({
    try: async () => {
      const target = resolve(fixtureRoot, scenario.target);
      if (scenario.id === "generated-view-drift") {
        await writeFile(target, `${await Bun.file(target).text()}${scenario.seed}`, "utf8");
      } else {
        await Bun.write(target, scenario.seed);
      }
    },
    catch: (cause) =>
      new ExperimentFailure({
        message: `cannot seed RX4 ${scenario.id} fixture: ${cause instanceof Error ? cause.message : String(cause)}`,
      }),
  });

const runScenario = (scenario: GateScenario): Effect.Effect<CommandResult, ExperimentFailure> =>
  Effect.scoped(
    Effect.gen(function* () {
      const fixtureRoot = yield* Effect.acquireRelease(
        Effect.tryPromise({
          try: () => mkdtemp(join(tmpdir(), `semantic-rx4-${scenario.id}-`)),
          catch: (cause) =>
            new ExperimentFailure({
              message: `cannot create RX4 ${scenario.id} fixture root: ${cause instanceof Error ? cause.message : String(cause)}`,
            }),
        }),
        (path) => Effect.promise(() => rm(path, { recursive: true, force: true })),
      );
      yield* copyFixtureRepository(fixtureRoot);
      yield* seedScenario(fixtureRoot, scenario);
      const env = {
        ...process.env,
        TMPDIR: join(fixtureRoot, "tmp"),
        XDG_CACHE_HOME: join(fixtureRoot, "xdg-cache"),
      };
      yield* Effect.tryPromise({
        try: () => mkdir(env.TMPDIR!, { recursive: true }),
        catch: (cause) =>
          new ExperimentFailure({
            message: `cannot create RX4 temporary cache: ${cause instanceof Error ? cause.message : String(cause)}`,
          }),
      });
      const result = yield* runCommand(fixtureRoot, scenario.command, env);
      yield* ensure(
        result.exitCode === 1,
        `RX4 ${scenario.id} gate exited ${result.exitCode}; expected seeded exit 1`,
      );
      const output = `${result.stdout}\n${result.stderr}`.toLowerCase();
      for (const marker of scenario.markers) {
        yield* ensure(
          output.includes(marker.toLowerCase()),
          `RX4 ${scenario.id} failure omitted expected observation ${JSON.stringify(marker)}`,
        );
      }
      return result;
    }),
  );

const jsonKeys = (value: unknown, path: string): ReadonlyArray<string> => {
  if (Array.isArray(value))
    return value.flatMap((item, index) => jsonKeys(item, `${path}[${index}]`));
  if (value === null || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, child]) =>
    [`${path}.${key}`].concat(jsonKeys(child, `${path}.${key}`)),
  );
};

const auditStableIdentities = (): Effect.Effect<StableIdentityAudit, ExperimentFailure> =>
  Effect.gen(function* () {
    const generatedFiles = yield* walkFiles(resolve(root, "generated"), false);
    const generatedText = yield* Effect.tryPromise({
      try: () => Promise.all(generatedFiles.map((path) => Bun.file(path).text())),
      catch: (cause) =>
        new ExperimentFailure({
          message: `cannot read generated views for RX4 identity audit: ${cause instanceof Error ? cause.message : String(cause)}`,
        }),
    });
    const positionalFields = generatedFiles.flatMap((path, index) =>
      POSITIONAL_ASSIGNMENT.test(generatedText[index]!) ? [relative(root, path)] : [],
    );
    const lockPaths = [
      resolve(root, "references/sources.lock.json"),
      resolve(root, "model/execution/inventory-tracer.json"),
    ];
    const lockDocuments = yield* Effect.tryPromise({
      try: () => Promise.all(lockPaths.map((path) => Bun.file(path).json())),
      catch: (cause) =>
        new ExperimentFailure({
          message: `cannot decode canonical lock documents for RX4 identity audit: ${cause instanceof Error ? cause.message : String(cause)}`,
        }),
    });
    const lockKeyPaths = lockDocuments.flatMap((document, index) =>
      jsonKeys(document, relative(root, lockPaths[index]!)),
    );
    const positionalLockFields = lockKeyPaths.filter((path) => {
      const field = path.slice(path.lastIndexOf(".") + 1);
      return POSITIONAL_FIELD_NAMES[field] === true;
    });
    const sources = lockDocuments[0]?.sources;
    const lockSources =
      sources !== null && typeof sources === "object" && !Array.isArray(sources)
        ? Object.keys(sources as Record<string, unknown>).length
        : 0;
    const positionalFieldsWithLocks = [...positionalFields, ...positionalLockFields];
    yield* ensure(
      positionalFieldsWithLocks.length === 0,
      `RX4 identity audit found positional fields: ${positionalFieldsWithLocks.join(", ")}`,
    );
    return {
      generatedFiles: generatedFiles.length,
      lockSources,
      positionalFields: positionalFieldsWithLocks,
    };
  });

const program = Effect.gen(function* () {
  const before = yield* repositoryDigest();
  const observations: Array<string> = [];
  for (const scenario of scenarios) {
    const result = yield* runScenario(scenario);
    observations.push(`${scenario.id}=exit-${result.exitCode}`);
  }
  const audit = yield* auditStableIdentities();
  const after = yield* repositoryDigest();
  yield* ensure(before === after, `RX4 changed the repository bytes (${before} != ${after})`);
  yield* Console.log(
    `rx4-enforcement-register: gates=${observations.join(",")}; generated-files=${audit.generatedFiles}; lock-sources=${audit.lockSources}; positional-fields=${audit.positionalFields.length}; scanned-repository=byte-identical; digest-excludes=.git,.omp,.references,.research-cache,node_modules; cleanup=completed; result=observed-not-proof; limits=canonical-generated-text-and-two-lock-documents-only`,
  );
});

runMain("rx4-enforcement-register", program);
