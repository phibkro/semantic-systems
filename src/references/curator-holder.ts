/**
 * Runtime-neutral child held behind util-linux `flock --no-fork`.
 *
 * The readiness file is created only after `flock` has acquired the kernel
 * lock and replaced itself with this process. A dormant timer gives the parent
 * a scoped lifetime handle under both Bun and Node; killing this process
 * closes the inherited lock descriptor.
 */
import { writeFileSync } from "node:fs";

const readyPath = process.argv[2];
if (readyPath === undefined) process.exit(64);
writeFileSync(readyPath, "semantic-curator-ready", { encoding: "utf8", flag: "wx", mode: 0o600 });
setInterval(() => {}, 60_000);
process.once("SIGTERM", () => process.exit(0));
process.once("SIGINT", () => process.exit(0));
