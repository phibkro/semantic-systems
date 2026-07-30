import {
  brokenTransition,
  referenceTransition,
  replay,
  type Replay,
  type Transition,
} from "./domain.ts";
import { DocumentError } from "./json.ts";

const TRANSITIONS: Readonly<Record<string, Transition>> = {
  "inventory.reference.v0": referenceTransition,
  "inventory.broken-ignore-stock.v0": brokenTransition,
};
const REPLAYS: Readonly<Record<string, Replay>> = {
  "inventory.replay.v0": replay,
};

export const resolveTransition = (key: string): Transition => {
  const operation = TRANSITIONS[key];
  if (operation === undefined) {
    throw new DocumentError({ message: `unbound transition operation '${key}'` });
  }
  return operation;
};

export const resolveReplay = (key: string): Replay => {
  const operation = REPLAYS[key];
  if (operation === undefined) {
    throw new DocumentError({ message: `unbound replay operation '${key}'` });
  }
  return operation;
};
