import { Console, type Crypto, Effect, type FileSystem, Path } from "effect";
import type { ChildProcessSpawner } from "effect/unstable/process";
import { catalogDigest, isLockable, loadCatalog } from "./catalog.ts";
import type { CuratorProcess } from "./curator.ts";
import { CatalogError } from "./errors.ts";
import type { GitEnvironment } from "./git.ts";
import { loadLock } from "./lockfile.ts";
import { lockOfflineSources } from "./offline-lock.ts";
import { materializeOfflineSources } from "./offline-materialize.ts";
import { computeStatus, isStrictOk, orphanedLockReport, type StatusReport } from "./status.ts";
import type { TomlParser } from "./toml.ts";

interface CatalogCheckCommand {
  readonly root: string;
  readonly name: "catalog-check";
}

interface StatusCommand {
  readonly root: string;
  readonly name: "status";
  readonly id: string | undefined;
  readonly all: boolean;
  readonly json: boolean;
  readonly lockOnly: boolean;
}

interface LockCommand {
  readonly root: string;
  readonly name: "lock";
  readonly id: string | undefined;
  readonly all: boolean;
}

interface MaterializeCommand {
  readonly root: string;
  readonly name: "materialize";
  readonly id: string | undefined;
  readonly all: boolean;
}

type Command = CatalogCheckCommand | LockCommand | MaterializeCommand | StatusCommand;

const usage =
  "usage: semrefs [--root PATH] catalog-check\n" +
  "       semrefs [--root PATH] lock <id>|--all --offline\n" +
  "       semrefs [--root PATH] materialize <id>|--all --offline\n" +
  "       semrefs [--root PATH] status <id>|--all [--lock-only] [--json]\n" +
  "(offline lock/materialize read an existing managed object cache or a declared local_hint sibling)";

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
  if (name === "catalog-check") {
    return index === arguments_.length ? { root, name: "catalog-check" } : undefined;
  }
  if (name !== "lock" && name !== "materialize" && name !== "status") return undefined;

  let id: string | undefined;
  let all = false;
  let lockOnly = false;
  let json = false;
  let offline = false;
  for (; index < arguments_.length; index += 1) {
    const argument = arguments_[index]!;
    if (argument === "--all") all = true;
    else if (argument === "--lock-only") lockOnly = true;
    else if (argument === "--json") json = true;
    else if (argument === "--offline") offline = true;
    else if (!argument.startsWith("--") && id === undefined) id = argument;
    else return undefined;
  }
  if (all === (id !== undefined)) return undefined;
  if (name === "lock") {
    return offline && !lockOnly && !json ? { root, name: "lock", id, all } : undefined;
  }
  if (name === "materialize") {
    return offline && !lockOnly && !json ? { root, name: "materialize", id, all } : undefined;
  }
  if (offline) return undefined;
  return { root, name: "status", id, all, json, lockOnly };
};

const reportToJson = (report: StatusReport): unknown => ({
  source_id: report.sourceId,
  state: report.state,
  strict_ok: isStrictOk(report),
  reasons: [...report.reasons],
  origin: report.origin,
  track: report.track,
  resolved_ref: report.resolvedRef,
  commit: report.commit,
  tree: report.tree,
  acquisition: report.acquisition,
  origin_verified: report.originVerified,
  licenses: report.licenses === null ? null : Object.fromEntries(report.licenses),
});

const printReport = (report: StatusReport): Effect.Effect<void> =>
  Effect.gen(function* () {
    yield* Console.log(`${report.sourceId}: ${report.state}`);
    if (report.origin !== null) yield* Console.log(`  origin: ${report.origin}`);
    if (report.track !== null) {
      yield* Console.log(`  track: ${report.track} -> resolved ${report.resolvedRef ?? "(none)"}`);
    }
    if (report.commit !== null) {
      yield* Console.log(`  commit: ${report.commit}`);
      yield* Console.log(`  tree: ${report.tree}`);
    }
    if (report.acquisition !== null) {
      yield* Console.log(
        `  acquisition: ${report.acquisition} (origin_verified=${report.originVerified})`,
      );
    }
    if (report.licenses !== null && report.licenses.size > 0) {
      yield* Console.log("  licenses:");
      for (const [licensePath, digest] of report.licenses) {
        yield* Console.log(`    ${licensePath}: ${digest}`);
      }
    }
    for (const reason of report.reasons) yield* Console.log(`  reason: ${reason}`);
  });

/**
 * Network-free catalog, offline lock/materialize, and strict status commands
 * from design spec 0004. Full status inspects a managed checkout through
 * hardened Git and portable filesystem services without mutating it.
 */
export const runSemrefs = (
  arguments_: ReadonlyArray<string>,
): Effect.Effect<
  number,
  never,
  | ChildProcessSpawner.ChildProcessSpawner
  | Crypto.Crypto
  | CuratorProcess
  | FileSystem.FileSystem
  | GitEnvironment
  | Path.Path
  | TomlParser
> => {
  const command = parseCommand(arguments_);
  if (command === undefined) {
    return Console.error(usage).pipe(Effect.as(2));
  }

  const program = Effect.gen(function* () {
    const path = yield* Path.Path;
    const root = path.resolve(command.root);
    const catalog = yield* loadCatalog(path.join(root, "references", "sources.toml"));

    if (command.name === "catalog-check") {
      for (const id of [...catalog.sources.keys()].sort()) {
        const source = catalog.sources.get(id)!;
        yield* Console.log(`${id}: ${isLockable(source) ? "lockable" : "queued (unlocked)"}`);
      }
      yield* Console.log(`${catalog.sources.size} source(s) validated`);
      return 0;
    }

    if (command.name === "lock") {
      let ids: ReadonlyArray<string>;
      if (command.all) {
        ids = [...catalog.sources.keys()].sort();
      } else if (command.id !== undefined && catalog.sources.has(command.id)) {
        ids = [command.id];
      } else {
        return yield* new CatalogError({
          message:
            command.id === undefined
              ? "an explicit source id or --all is required"
              : `unknown source id ${JSON.stringify(command.id)}`,
        });
      }
      const result = yield* lockOfflineSources(root, ids, "semantic-systems/0.0.0");
      for (const id of result.skipped) {
        yield* Console.error(`${id}: skipped (not lockable, missing track/license_paths)`);
      }
      for (const { id, error } of result.failures) {
        yield* Console.error(`${id}: lock failed: ${error.message}`);
      }
      if (!result.committed) {
        for (const [id, entry] of result.locked) {
          yield* Console.error(`${id}: observed ${entry.commit} but not published`);
        }
        yield* Console.error("lock: one or more requested sources failed; writing no lock changes");
        return 1;
      }
      for (const [id, entry] of result.locked) {
        yield* Console.log(`${id}: locked at ${entry.commit}`);
      }
      return 0;
    }

    if (command.name === "materialize") {
      let ids: ReadonlyArray<string>;
      if (command.all) {
        ids = [...catalog.sources.keys()].sort();
      } else if (command.id !== undefined && catalog.sources.has(command.id)) {
        ids = [command.id];
      } else {
        return yield* new CatalogError({
          message:
            command.id === undefined
              ? "an explicit source id or --all is required"
              : `unknown source id ${JSON.stringify(command.id)}`,
        });
      }
      const result = yield* materializeOfflineSources(root, ids);
      for (const { id, error } of result.failures) {
        yield* Console.error(`${id}: materialize failed: ${error.message}`);
      }
      for (const [id, target] of result.materialized) {
        yield* Console.log(`${id}: materialized at ${target}`);
      }
      return result.failures.length === 0 ? 0 : 1;
    }

    const lock = yield* loadLock(path.join(root, "references", "sources.lock.json"));

    let ids: ReadonlyArray<string>;
    if (command.all) {
      ids = [...catalog.sources.keys()].sort();
    } else if (command.id !== undefined && catalog.sources.has(command.id)) {
      ids = [command.id];
    } else {
      return yield* new CatalogError({
        message:
          command.id === undefined
            ? "an explicit source id or --all is required"
            : `unknown source id ${JSON.stringify(command.id)}`,
      });
    }

    const reports: Array<StatusReport> = [];
    for (const id of ids) {
      const source = catalog.sources.get(id)!;
      const digest = yield* catalogDigest(source.raw);
      reports.push(
        yield* computeStatus(
          source,
          digest,
          lock,
          path.join(root, ".references"),
          command.lockOnly,
        ),
      );
    }
    if (command.all) {
      const orphanedIds = [...lock.sources.keys()].filter((id) => !catalog.sources.has(id)).sort();
      for (const id of orphanedIds) {
        reports.push(orphanedLockReport(id, lock.sources.get(id)!, command.lockOnly));
      }
    }

    if (command.json) {
      yield* Console.log(JSON.stringify(reports.map(reportToJson), null, 2));
    } else {
      for (const report of reports) yield* printReport(report);
    }
    return reports.every(isStrictOk) ? 0 : 1;
  });

  return program.pipe(
    Effect.catch((error) => Console.error(`error: ${error.message}`).pipe(Effect.as(2))),
  );
};
