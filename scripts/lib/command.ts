import { stat } from "node:fs/promises";
import { resolve } from "node:path";
import { Console, Data, Effect } from "effect";

export class ToolMissing extends Data.TaggedError("ToolMissing")<{
  readonly label: string;
  readonly tool: string;
}> {
  override get message(): string {
    return `${this.label}: required tool '${this.tool}' is not installed. Run inside 'nix develop'.`;
  }
}

export class ExecutableMissing extends Data.TaggedError("ExecutableMissing")<{
  readonly label: string;
  readonly path: string;
  readonly guidance: string;
}> {
  override get message(): string {
    return `${this.label}: ${this.path} is missing or not executable; ${this.guidance}`;
  }
}

export class CommandFailed extends Data.TaggedError("CommandFailed")<{
  readonly command: ReadonlyArray<string>;
  readonly exitCode: number;
}> {
  override get message(): string {
    return `${this.command.join(" ")} exited with status ${this.exitCode}`;
  }
}

export type CommandError = ToolMissing | ExecutableMissing | CommandFailed;

export const requireTool = (label: string, tool: string): Effect.Effect<string, ToolMissing> =>
  Effect.sync(() => Bun.which(tool)).pipe(
    Effect.flatMap((path) =>
      path === null ? Effect.fail(new ToolMissing({ label, tool })) : Effect.succeed(path),
    ),
  );

export const requireExecutable = (
  root: string,
  label: string,
  path: string,
  guidance: string,
): Effect.Effect<void, ExecutableMissing> =>
  Effect.tryPromise({
    try: () => stat(resolve(root, path)),
    catch: () => new ExecutableMissing({ label, path, guidance }),
  }).pipe(
    Effect.flatMap((metadata) =>
      (metadata.mode & 0o111) === 0
        ? Effect.fail(new ExecutableMissing({ label, path, guidance }))
        : Effect.void,
    ),
  );

export const runCommand = (
  command: ReadonlyArray<string>,
  options: {
    readonly cwd: string;
    readonly env?: Record<string, string | undefined>;
  },
): Effect.Effect<void, CommandFailed> =>
  Effect.sync(() =>
    Bun.spawnSync({
      cmd: [...command],
      cwd: options.cwd,
      env: options.env ?? process.env,
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit",
    }),
  ).pipe(
    Effect.flatMap((result) =>
      result.exitCode === 0
        ? Effect.void
        : Effect.fail(new CommandFailed({ command, exitCode: result.exitCode })),
    ),
  );

export const exitCodeFor = (error: unknown): number =>
  error instanceof CommandFailed ? error.exitCode : 1;

export const runMain = (
  label: string,
  program: Effect.Effect<void, { readonly message: string }>,
): void => {
  const handled = program.pipe(
    Effect.catch((error) =>
      Effect.gen(function* () {
        yield* Console.error(error instanceof Error ? error.message : `${label}: ${String(error)}`);
        yield* Effect.sync(() => {
          process.exitCode = exitCodeFor(error);
        });
      }),
    ),
  );
  void Effect.runPromise(handled);
};
