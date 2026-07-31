import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";
import { parseDeploymentStage } from "./src/deployment.ts";

/**
 * Explicitly includes the generated mutable pointer and content-addressed
 * snapshot. Alchemy's gitignore-derived default would omit `public/data/**`.
 */
export const ALCHEMY_MEMO_INPUTS = {
  include: [
    "index.html",
    "package.json",
    "tsconfig.json",
    "tsconfig.app.json",
    "tsconfig.node.json",
    "vite.config.ts",
    "src/**",
    "public/**",
  ],
  exclude: [] as string[],
  lockfile: true,
};

export const ControlRoomWebsite = Cloudflare.Website.Vite(
  "ControlRoomWebsite",
  Effect.gen(function* () {
    const stage = yield* Alchemy.Stage;
    const deployment = parseDeploymentStage(stage);
    return {
      rootDir: "./apps/control-room",
      domain: deployment.domain,
      memo: ALCHEMY_MEMO_INPUTS,
    };
  }),
);

export default Alchemy.Stack(
  "SemanticControlRoom",
  {
    providers: Cloudflare.providers(),
    state: Cloudflare.state(),
  },
  Effect.gen(function* () {
    const website = yield* ControlRoomWebsite;
    return { url: website.url };
  }),
);
