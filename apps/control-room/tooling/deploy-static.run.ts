import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";
import { parseDeploymentStage } from "../src/deployment.ts";
import { resolveStaticArtifactRoot, validateStaticArtifact } from "./scan-public-payload.ts";

const PASSTHROUGH_WORKER = `
export default {
  async fetch(request, env) {
    return env.ASSETS.fetch(request);
  }
};
`;

const staticRoot = resolveStaticArtifactRoot(process.env.CONTROL_ROOM_STATIC_DIR ?? "");
const expectedCommit = process.env.CONTROL_ROOM_ARTIFACT_COMMIT ?? "";
await validateStaticArtifact(staticRoot, expectedCommit);

export default Alchemy.Stack(
  "SemanticControlRoom",
  {
    providers: Cloudflare.providers(),
    state: Cloudflare.state(),
  },
  Effect.gen(function* () {
    const stage = yield* Alchemy.Stage;
    const deployment = parseDeploymentStage(stage);
    const website = yield* Cloudflare.Worker("ControlRoomWebsite", {
      script: PASSTHROUGH_WORKER,
      assets: {
        directory: staticRoot,
        htmlHandling: "drop-trailing-slash",
        notFoundHandling: "single-page-application",
      },
      domain: deployment.domain,
    });
    return { url: website.url };
  }),
);
