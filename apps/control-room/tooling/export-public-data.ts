import { BunCrypto, BunFileSystem, BunPath } from "@effect/platform-bun";
import { Clock, Console, Effect, FileSystem, Path } from "effect";
import {
  buildPublicArtifact,
  type ObservationSource,
} from "../../../src/project-model/public-export.ts";
import { loadProject } from "../../../src/project-model/loader.ts";
import {
  compileFeatureDossiers,
  withFeatureDossiers,
} from "../../../src/project-model/work-lifecycle.ts";
import { buildPublicPortfolioArtifact, loadPortfolio } from "../../../src/portfolio-model/index.ts";

const sourceFrom = (value: string | undefined): ObservationSource => {
  if (value === "local_preview" || value === "main_ci_assertion" || value === "pr_ci_assertion") {
    return value;
  }
  throw new Error(`invalid CONTROL_ROOM_OBSERVATION_SOURCE: ${JSON.stringify(value)}`);
};

const exactCommit = (root: string) =>
  Effect.tryPromise({
    try: async () => {
      const configured = Bun.env.CONTROL_ROOM_COMMIT;
      if (configured !== undefined) return configured;
      const child = Bun.spawn(["git", "-C", root, "rev-parse", "HEAD"], {
        stdout: "pipe",
        stderr: "pipe",
      });
      const [status, stdout, stderr] = await Promise.all([
        child.exited,
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
      ]);
      if (status !== 0) throw new Error(stderr.trim() || `git exited ${status}`);
      return stdout.trim();
    },
    catch: (cause) => new Error("cannot observe exact Git commit", { cause }),
  });

const program = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const appRoot = path.resolve(import.meta.dirname, "..");
  const root = path.resolve(appRoot, "../..");
  const output = path.join(appRoot, "public", "data");
  const loadedProject = yield* loadProject(root);
  const dossiers = yield* compileFeatureDossiers(root);
  const project = withFeatureDossiers(loadedProject, dossiers);
  const portfolio = yield* loadPortfolio(root);
  const commit = yield* exactCommit(root);
  const now = yield* Clock.currentTimeMillis;
  const observedAt =
    Bun.env.CONTROL_ROOM_OBSERVED_AT ?? new Date(now).toISOString().replace(/\.\d{3}Z$/, "Z");
  const artifact = yield* buildPublicArtifact(project, {
    commit,
    observedAt,
    freshnessSeconds: 86_400,
    deployedCheckStatus: "not_checked",
    observationSource: sourceFrom(Bun.env.CONTROL_ROOM_OBSERVATION_SOURCE ?? "local_preview"),
  });
  const portfolioArtifact = yield* buildPublicPortfolioArtifact(portfolio, {
    commit,
    observed_at: observedAt,
    freshness_seconds: 86_400,
  });

  yield* fs.makeDirectory(output, { recursive: true });
  const files = yield* fs.readDirectory(output);
  yield* Effect.forEach(
    files.filter(
      (name) =>
        name.startsWith("snapshot.") && name.endsWith(".json") && name !== artifact.snapshotName,
    ),
    (name) => fs.remove(path.join(output, name)),
    { discard: true },
  );
  yield* fs.writeFileString(path.join(output, artifact.snapshotName), artifact.snapshotBytes);
  yield* fs.writeFileString(path.join(output, "version.json"), artifact.versionBytes);
  yield* Effect.forEach(
    files.filter(
      (name) =>
        name.startsWith("portfolio.") &&
        name.endsWith(".json") &&
        name !== portfolioArtifact.snapshot_name,
    ),
    (name) => fs.remove(path.join(output, name)),
    { discard: true },
  );
  yield* fs.writeFileString(
    path.join(output, portfolioArtifact.snapshot_name),
    portfolioArtifact.snapshot_bytes,
  );
  yield* fs.writeFileString(
    path.join(output, "portfolio-version.json"),
    portfolioArtifact.version_bytes,
  );
  yield* Console.log(
    `derived ${artifact.snapshotName} and ${portfolioArtifact.snapshot_name} from ${commit}`,
  );
}).pipe(Effect.provide([BunFileSystem.layer, BunPath.layer, BunCrypto.layer]));

Effect.runPromise(program).catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
