import { Console, Effect, type Crypto, type FileSystem, type Path } from "effect";
import {
  actorObservationJson,
  actorObservationSucceeded,
  runInventoryActorJourney,
  type ActorRuntimeLayer,
} from "./journey.ts";

export const runActorCli = (
  arguments_: ReadonlyArray<string>,
  runtimeLayer: ActorRuntimeLayer,
): Effect.Effect<number, never, FileSystem.FileSystem | Path.Path | Crypto.Crypto> => {
  const scenarioPath = arguments_[0];
  if (scenarioPath === undefined || arguments_.length !== 1) {
    return Console.error("usage: semantic-actor SCENARIO.json").pipe(Effect.as(2));
  }
  return runInventoryActorJourney(scenarioPath, runtimeLayer).pipe(
    Effect.tap((observation) => Console.log(actorObservationJson(observation))),
    Effect.map((observation) => (actorObservationSucceeded(observation) ? 0 : 1)),
    Effect.catch((error) => Console.error(error.message).pipe(Effect.as(1))),
  );
};
