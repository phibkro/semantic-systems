/* oxlint-disable semantic-effect/portable-runtime-imports -- Git observation is a Bun CLI adapter, not portable semantic code */
/* oxlint-disable semantic-effect/typed-failure-boundary -- Bun spawn failures are converted to the typed GitObservationError at this CLI boundary */
import { Console, Data, Effect, Path, type Crypto, type FileSystem } from "effect";
import { loadFeatureDossier, loadProject } from "./loader.ts";
import {
  PROJECT_JSON_LANGUAGE_SERVER_CONFIG_PATH,
  projectJsonLanguageServerConfigText,
} from "./project-json-schema.ts";
import { assessWork, criticalPath } from "./schedule.ts";
import { compileFeatureDossier, type FeatureDossierArtifact } from "./feature-dossier.ts";
import { validateProject, type ValidationIssue } from "./validate.ts";
import { compileFeatureDossiers, withFeatureDossiers } from "./work-lifecycle.ts";
import { generateViews, writeGeneratedFiles } from "./views.ts";

interface ProjectCommand {
  readonly root: string;
  readonly name: "validate" | "report" | "generate";
  readonly output: string;
  readonly check: boolean;
  readonly outputExplicit: boolean;
}

interface FeatureValidateCommand {
  readonly root: string;
  readonly name: "feature-validate";
  readonly featureId: string;
}

type Command = ProjectCommand | FeatureValidateCommand;

const usage =
  "usage: semproj [--root PATH] {feature validate --feature ID,validate,report,generate} [--output PATH] [--check]";

const parseCommand = (arguments_: ReadonlyArray<string>): Command | undefined => {
  let root = ".";
  let index = 0;
  if (arguments_[index] === "--root") {
    const value = arguments_[index + 1];
    if (value === undefined) return undefined;
    root = value;
    index += 2;
  }
  const name = arguments_[index++];
  if (name === "feature") {
    if (arguments_[index++] !== "validate" || arguments_[index++] !== "--feature") return undefined;
    const featureId = arguments_[index++];
    return featureId !== undefined && index === arguments_.length
      ? { root, name: "feature-validate", featureId }
      : undefined;
  }
  if (name !== "validate" && name !== "report" && name !== "generate") return undefined;
  if (name !== "generate") {
    return index === arguments_.length
      ? { root, name, output: "generated", outputExplicit: false, check: false }
      : undefined;
  }

  let output = "generated";
  let check = false;
  let outputExplicit = false;
  for (; index < arguments_.length; index += 1) {
    const argument = arguments_[index]!;
    if (argument === "--output" && arguments_[index + 1] !== undefined) {
      output = arguments_[++index]!;
      outputExplicit = true;
    } else if (argument === "--check") {
      check = true;
    } else {
      return undefined;
    }
  }
  return { root, name, output, outputExplicit, check };
};

type ProjectIssue = ValidationIssue;
class GitObservationError extends Data.TaggedError("GitObservationError")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

const issueText = (issue: ProjectIssue): string => {
  const entity = issue.entityId === undefined ? "" : ` [${issue.entityId}]`;
  return `${issue.severity}: ${issue.code}${entity}: ${issue.message}`;
};

const runGit = (
  root: string,
  arguments_: ReadonlyArray<string>,
): Effect.Effect<string, GitObservationError> =>
  Effect.try({
    try: () => {
      const result = Bun.spawnSync({
        cmd: ["git", "-C", root, ...arguments_],
        stdout: "pipe",
        stderr: "pipe",
      });
      if (result.exitCode !== 0) {
        throw new GitObservationError({
          message: result.stderr.toString().trim() || "git command failed",
        });
      }
      return result.stdout.toString().trim();
    },
    catch: (cause) =>
      cause instanceof GitObservationError
        ? cause
        : new GitObservationError({ message: "cannot observe Git state", cause }),
  });

const observeGit = (
  root: string,
  featureId?: string,
): Effect.Effect<Record<string, unknown>, never> =>
  Effect.gen(function* () {
    const head = yield* runGit(root, ["rev-parse", "HEAD"]).pipe(
      Effect.orElseSucceed(() => "unobserved"),
    );
    const status = yield* runGit(root, ["status", "--porcelain", "--untracked-files=all"]).pipe(
      Effect.orElseSucceed(() => "unobserved"),
    );
    const clean = status === "";
    return {
      format: "semantic.feature-git-observation/v1",
      ...(featureId === undefined ? {} : { feature_id: featureId }),
      head,
      clean,
    };
  });

const dossierText = (dossier: FeatureDossierArtifact): ReadonlyArray<string> => {
  const lifecycle = dossier.lifecycle;
  return [
    `feature: ${dossier.feature_id}`,
    `directory: ${dossier.directory}`,
    `phase: ${lifecycle.phase.value} [${lifecycle.phase.sources.map((source) => `${source.kind}:${source.id}`).join(", ")}]`,
    `readiness: ${lifecycle.readiness.value} [${lifecycle.readiness.sources.map((source) => `${source.kind}:${source.id}`).join(", ")}]`,
    `condition: ${lifecycle.condition.value} [${lifecycle.condition.sources.map((source) => `${source.kind}:${source.id}`).join(", ")}]`,
    `delivery: ${lifecycle.delivery.value} [${lifecycle.delivery.sources.map((source) => `${source.kind}:${source.id}`).join(", ")}]`,
    `closure: ${lifecycle.closure.value} [${lifecycle.closure.sources.map((source) => `${source.kind}:${source.id}`).join(", ")}]`,
    `diagnostics: ${dossier.diagnostics.length}`,
  ];
};

const runFeatureValidation = (
  root: string,
  featureId: string,
): Effect.Effect<number, never, FileSystem.FileSystem | Path.Path | Crypto.Crypto> =>
  Effect.gen(function* () {
    const git = yield* observeGit(root, featureId);
    const input = yield* loadFeatureDossier(root, featureId, { git });
    const dossier = yield* compileFeatureDossier(input);
    for (const line of dossierText(dossier)) yield* Console.log(line);
    for (const diagnostic of dossier.diagnostics) {
      yield* Console.log(
        `diagnostic: ${diagnostic.code} (${diagnostic.path}): ${diagnostic.message}`,
      );
    }
    return dossier.diagnostics.some((diagnostic) => diagnostic.code.startsWith("receipt.")) ? 1 : 0;
  }).pipe(
    Effect.catch((error) =>
      Console.error(error instanceof Error ? error.message : String(error)).pipe(Effect.as(1)),
    ),
  );

export const runSemproj = (
  arguments_: ReadonlyArray<string>,
): Effect.Effect<number, never, FileSystem.FileSystem | Path.Path | Crypto.Crypto> => {
  const command = parseCommand(arguments_);
  if (command === undefined) return Console.error(usage).pipe(Effect.as(2));
  if (command.name === "feature-validate")
    return runFeatureValidation(command.root, command.featureId);

  return Effect.gen(function* () {
    const pathService = yield* Path.Path;
    const loadedProject = yield* loadProject(command.root);
    const git = yield* observeGit(loadedProject.root);
    const dossiers = yield* compileFeatureDossiers(loadedProject.root, git);
    const project = withFeatureDossiers(loadedProject, dossiers);
    const issues = validateProject(project);
    if (command.name === "validate") {
      for (const issue of issues) yield* Console.log(issueText(issue));
      const errors = issues.filter((issue) => issue.severity === "error").length;
      const warnings = issues.filter((issue) => issue.severity === "warning").length;
      yield* Console.log(
        `validated ${project.entities.size} entities and ${project.relations.length} relations: ${errors} error(s), ${warnings} warning(s)`,
      );
      return errors > 0 ? 1 : 0;
    }

    const errors = issues.filter((issue) => issue.severity === "error");
    if (errors.length > 0) {
      for (const issue of errors) yield* Console.error(issueText(issue));
      yield* Console.error(
        `${command.name === "generate" ? "generation" : "report"} aborted: project model has ${errors.length} validation error(s)`,
      );
      return 1;
    }

    if (command.name === "report") {
      const assessments = assessWork(project);
      const ready = assessments.filter((item) => item.ready);
      yield* Console.log(`entities: ${project.entities.size}`);
      yield* Console.log(`relations: ${project.relations.length}`);
      yield* Console.log(`work items: ${assessments.length}`);
      yield* Console.log(`ready frontier: ${ready.length}`);
      for (const item of ready) {
        yield* Console.log(
          `  - ${item.entity.name}: ${item.recommendation} (${item.agentability}/100)`,
        );
      }
      const criticalIds = criticalPath(project);
      if (criticalIds.length > 0) {
        yield* Console.log(
          `critical path: ${criticalIds.map((entityId) => project.entities.get(entityId)!.name).join(" -> ")}`,
        );
      }
      return 0;
    }

    const views = generateViews(project, dossiers);
    const changedViews = yield* writeGeneratedFiles(
      pathService.resolve(project.root, command.output),
      views,
      command.check,
    );
    const changedRepositoryFiles = command.outputExplicit
      ? []
      : yield* writeGeneratedFiles(
          project.root,
          new Map([
            [PROJECT_JSON_LANGUAGE_SERVER_CONFIG_PATH, projectJsonLanguageServerConfigText()],
          ]),
          command.check,
        );
    const changed = [...changedViews, ...changedRepositoryFiles];
    if (command.check && changed.length > 0) {
      yield* Console.error("generated projections are stale:");
      for (const changedPath of changed) yield* Console.error(`  ${changedPath}`);
      return 1;
    }
    const repositoryConfigurationCount = command.outputExplicit ? 0 : 1;
    yield* Console.log(
      `${command.check ? "checked" : "generated"} ${views.size} views and ${repositoryConfigurationCount} repository configurations`,
    );
    return 0;
  }).pipe(
    Effect.catch((error) =>
      Console.error(error instanceof Error ? error.message : String(error)).pipe(Effect.as(1)),
    ),
  );
};
