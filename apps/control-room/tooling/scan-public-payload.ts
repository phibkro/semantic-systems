import { Console, Effect } from "effect";
import { isPublicVersion, verifyCandidate } from "../src/snapshot.ts";

const FORBIDDEN = [
  { label: "absolute home path", pattern: /(?:\/home\/|\/Users\/|[A-Za-z]:\\Users\\)/ },
  { label: "private key", pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { label: "GitHub token", pattern: /gh[pousr]_[A-Za-z0-9_]{12,}/ },
  {
    label: "secret sentinel",
    pattern:
      /(?:SECRET_SHAPED_SENTINEL|CI_CONTEXT_SENTINEL|PRIVATE_TRANSCRIPT_SENTINEL|INJECTION_SENTINEL)/,
  },
  { label: "agent transcript", pattern: /(?:<system>|<developer>|tool_call_id|agent transcript)/ },
] as const;

const program = Effect.gen(function* () {
  const root = `${import.meta.dirname}/../dist`;
  const files = yield* Effect.promise(async () => {
    const found: Array<string> = [];
    for await (const relative of new Bun.Glob("**/*").scan({ cwd: root, onlyFiles: true })) {
      found.push(relative);
    }
    return found;
  });
  const versions = files.filter((file) => file === "data/version.json");
  const snapshots = files.filter((file) => /^data\/snapshot\.[0-9a-f]{64}\.json$/.test(file));
  if (versions.length !== 1 || snapshots.length !== 1) {
    return yield* Effect.fail(
      new Error(
        `expected one version and one snapshot, found ${versions.length} and ${snapshots.length}`,
      ),
    );
  }
  const versionValue: unknown = yield* Effect.promise(() =>
    Bun.file(`${root}/${versions[0]}`).json(),
  );
  if (!isPublicVersion(versionValue)) {
    return yield* Effect.fail(new Error("built version document is invalid"));
  }
  const snapshotValue: unknown = yield* Effect.promise(() =>
    Bun.file(`${root}/${snapshots[0]}`).json(),
  );
  yield* Effect.tryPromise({
    try: () => verifyCandidate(versionValue, snapshotValue),
    catch: (cause) => new Error("built snapshot failed content verification", { cause }),
  });
  if (!files.includes("sw.js")) {
    return yield* Effect.fail(new Error("built PWA is missing sw.js"));
  }
  const worker = yield* Effect.promise(() => Bun.file(`${root}/sw.js`).text());
  if (worker.includes("data/version.json") || worker.includes(versionValue.snapshot)) {
    return yield* Effect.fail(
      new Error("service worker must not precache mutable public snapshot data"),
    );
  }
  for (const relative of files.sort()) {
    const text = yield* Effect.promise(() => Bun.file(`${root}/${relative}`).text());
    for (const { label, pattern } of FORBIDDEN) {
      if (pattern.test(text)) {
        return yield* Effect.fail(new Error(`${relative} contains forbidden ${label}`));
      }
    }
  }
  yield* Console.log(`verified ${files.length} public payload files`);
});

Effect.runPromise(program).catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
