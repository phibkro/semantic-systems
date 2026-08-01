#!/usr/bin/env bun
import { resolve } from "node:path";
import { Data, Effect } from "effect";
import { runCommand, runMain } from "../lib/command.ts";

class AcceptanceFailure extends Data.TaggedError("AcceptanceFailure")<{
  readonly message: string;
}> {}

const root = resolve(import.meta.dirname, "../..");
const expectedEffect = "4.0.0-beta.102";
const activeToolchainFiles = async (): Promise<string[]> => {
  const files = [
    ".github/workflows/check.yml",
    "flake.nix",
    "justfile",
    "package.json",
    "tsconfig.json",
  ];
  for (const directory of [".githooks", "scripts/lib"]) {
    const glob = new Bun.Glob("**/*");
    for await (const path of glob.scan({ cwd: resolve(root, directory), onlyFiles: true })) {
      files.push(`${directory}/${path}`);
    }
  }
  const checkGlob = new Bun.Glob("check*.ts");
  for await (const path of checkGlob.scan({ cwd: resolve(root, "scripts"), onlyFiles: true })) {
    files.push(`scripts/${path}`);
  }
  return files.sort();
};

const ownedFiles = async (extensions: ReadonlyArray<string>): Promise<string[]> => {
  const files: string[] = [];
  for (const directory of ["src", "tests", "scripts", ".githooks"]) {
    const glob = new Bun.Glob("**/*");
    for await (const path of glob.scan({ cwd: resolve(root, directory), onlyFiles: true })) {
      if (extensions.some((extension) => path.endsWith(extension))) {
        files.push(`${directory}/${path}`);
      }
    }
  }
  return files.sort();
};

const ownedShellPrograms = async (): Promise<string[]> => {
  const shell: string[] = [];
  for (const directory of ["src", "tests", "scripts", ".githooks"]) {
    const glob = new Bun.Glob("**/*");
    for await (const path of glob.scan({ cwd: resolve(root, directory), onlyFiles: true })) {
      const repositoryPath = `${directory}/${path}`;
      const firstLine = (await Bun.file(resolve(root, repositoryPath)).text()).split("\n", 1)[0];
      if (path.endsWith(".sh") || /^#!.*\b(?:ba|z|da|k)?sh\b/.test(firstLine ?? "")) {
        shell.push(repositoryPath);
      }
    }
  }
  return shell.sort();
};

export const pythonRemovalAcceptance = Effect.gen(function* () {
  const manifest = (yield* Effect.tryPromise({
    try: () => Bun.file(resolve(root, "package.json")).json(),
    catch: (cause) =>
      new AcceptanceFailure({ message: `cannot load package.json: ${String(cause)}` }),
  })) as { dependencies?: Record<string, string> };
  if (manifest.dependencies?.effect !== expectedEffect) {
    return yield* new AcceptanceFailure({
      message: `package.json must pin effect exactly to ${expectedEffect}`,
    });
  }
  const lock = (yield* Effect.tryPromise({
    try: async () => Bun.JSONC.parse(await Bun.file(resolve(root, "bun.lock")).text()),
    catch: (cause) => new AcceptanceFailure({ message: `cannot load bun.lock: ${String(cause)}` }),
  })) as { workspaces?: { ""?: { dependencies?: Record<string, string> } } };
  if (lock.workspaces?.[""]?.dependencies?.effect !== expectedEffect) {
    return yield* new AcceptanceFailure({
      message: `bun.lock root workspace must pin effect exactly to ${expectedEffect}`,
    });
  }

  const effectPackage = (yield* Effect.tryPromise({
    try: () => import("effect/package.json", { with: { type: "json" } }),
    catch: (cause) =>
      new AcceptanceFailure({ message: `cannot load effect package metadata: ${String(cause)}` }),
  })) as { default: { version: string } };
  if (effectPackage.default.version !== expectedEffect) {
    return yield* new AcceptanceFailure({
      message: `expected effect ${expectedEffect}, found ${effectPackage.default.version}`,
    });
  }

  const pythonFiles = yield* Effect.promise(() => ownedFiles([".py"]));
  if (pythonFiles.length > 0) {
    return yield* new AcceptanceFailure({
      message: `repository-owned Python files remain:\n${pythonFiles.join("\n")}`,
    });
  }
  const pyprojectExists = yield* Effect.promise(() =>
    Bun.file(resolve(root, "pyproject.toml")).exists(),
  );
  if (pyprojectExists) {
    return yield* new AcceptanceFailure({ message: "pyproject.toml remains" });
  }

  const shellFiles = yield* Effect.promise(ownedShellPrograms);
  if (shellFiles.length > 0) {
    return yield* new AcceptanceFailure({
      message: `repository-owned project-logic shell files remain:\n${shellFiles.join("\n")}`,
    });
  }

  for (const path of yield* Effect.promise(activeToolchainFiles)) {
    const text = yield* Effect.promise(() => Bun.file(resolve(root, path)).text());
    if (/(python|pytest|pyright|ruff)/i.test(text)) {
      return yield* new AcceptanceFailure({
        message: `active toolchain still references Python in ${path}`,
      });
    }
  }

  // The canonical integration gate owns the frozen install, Effect setup,
  // typecheck, model projections, lint, and complete Bun suite. Calling those
  // commands separately here would test the same head twice without adding an
  // observation.
  yield* runCommand(["bun", "scripts/check.ts"], { cwd: root });
  yield* runCommand(["nix", "flake", "check"], { cwd: root });
});

if (import.meta.main) {
  runMain("accept/0010", pythonRemovalAcceptance);
}
