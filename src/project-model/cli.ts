import { Console, Effect, Path, type FileSystem } from "effect";
import { loadProject } from "./loader.ts";
import { assessWork, criticalPath } from "./schedule.ts";
import { validateFeatureRepository, type FeatureDiagnostic } from "./work-lifecycle.ts";
import { validateProject, type ValidationIssue } from "./validate.ts";
import { generateViews, writeViews } from "./views.ts";

interface Command {
  readonly root: string;
  readonly name: "validate" | "report" | "generate";
  readonly output: string;
  readonly check: boolean;
}

const usage = "usage: semproj [--root PATH] {validate,report,generate} [--output PATH] [--check]";

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
  if (name !== "validate" && name !== "report" && name !== "generate") return undefined;
  if (name !== "generate") {
    return index === arguments_.length
      ? { root, name, output: "generated", check: false }
      : undefined;
  }

  let output = "generated";
  let check = false;
  for (; index < arguments_.length; index += 1) {
    const argument = arguments_[index]!;
    if (argument === "--output" && arguments_[index + 1] !== undefined) {
      output = arguments_[++index]!;
    } else if (argument === "--check") {
      check = true;
    } else {
      return undefined;
    }
  }
  return { root, name, output, check };
};

type ProjectIssue = ValidationIssue | FeatureDiagnostic;

const issueText = (issue: ProjectIssue): string => {
  const entity = issue.entityId === undefined ? "" : ` [${issue.entityId}]`;
  const path = "path" in issue && issue.path !== undefined ? ` (${issue.path})` : "";
  const source = "source" in issue && issue.source !== undefined ? ` (${issue.source})` : "";
  return `${issue.severity}: ${issue.code}${entity}${path}${source}: ${issue.message}`;
};

export const runSemproj = (
  arguments_: ReadonlyArray<string>,
): Effect.Effect<number, never, FileSystem.FileSystem | Path.Path> => {
  const command = parseCommand(arguments_);
  if (command === undefined) {
    return Console.error(usage).pipe(Effect.as(2));
  }

  return Effect.gen(function* () {
    const pathService = yield* Path.Path;
    const project = yield* loadProject(command.root);
    const issues: ReadonlyArray<ProjectIssue> = [
      ...validateProject(project),
      ...(yield* validateFeatureRepository(project, project.root)),
    ];
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

    const views = generateViews(project);
    const changed = yield* writeViews(
      pathService.join(project.root, command.output),
      views,
      command.check,
    );
    if (command.check && changed.length > 0) {
      yield* Console.error("generated views are stale:");
      for (const changedPath of changed) yield* Console.error(`  ${changedPath}`);
      return 1;
    }
    yield* Console.log(`${command.check ? "checked" : "generated"} ${views.size} views`);
    return 0;
  }).pipe(Effect.catch((error) => Console.error(error.message).pipe(Effect.as(1))));
};
