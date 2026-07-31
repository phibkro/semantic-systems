import { parseDeploymentStage, previewCleanupTarget } from "../src/deployment.ts";

const [operation, rawStage] = Bun.argv.slice(2);
if ((operation !== "deploy" && operation !== "cleanup") || rawStage === undefined) {
  throw new Error("usage: deployment-identity.ts deploy|cleanup prod|p<PR>");
}
const deployment = parseDeploymentStage(rawStage);
if (operation === "cleanup") {
  if (deployment.kind !== "preview") throw new Error("cleanup requires a preview deployment");
  process.stdout.write(`stage=${previewCleanupTarget(deployment).stage}\n`);
} else {
  process.stdout.write(`stage=${deployment.stage}\nurl=${deployment.url}\n`);
}
