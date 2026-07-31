import { useMachine } from "@xstate/react";
import type { DataState, SnapshotState } from "./model.ts";
import { snapshotMachine } from "./snapshot-machine.ts";

const TRANSIENT = new Set([
  "hydrating",
  "refreshing",
  "resolving",
  "adopting",
  "keeping",
  "settling",
]);

const observedState = (value: unknown, hasSnapshot: boolean): DataState => {
  if (typeof value === "string" && TRANSIENT.has(value)) return hasSnapshot ? "stale" : "loading";
  if (value === "updateAvailable") return "update_available";
  if (
    value === "current" ||
    value === "stale" ||
    value === "offline" ||
    value === "invalid" ||
    value === "unavailable"
  )
    return value;
  return hasSnapshot ? "stale" : "loading";
};

export const useSnapshot = (): SnapshotState & {
  readonly refresh: () => void;
  readonly applyUpdate: () => void;
} => {
  const [machine, send] = useMachine(snapshotMachine, {
    input: {
      baseUrl: new URL(import.meta.env.BASE_URL, document.baseURI),
      browser: window,
      online: navigator.onLine,
      storage: localStorage,
    },
  });
  return {
    state: observedState(machine.value, machine.context.snapshot !== null),
    snapshot: machine.context.snapshot,
    pending: machine.context.pending,
    ...(machine.context.detail === undefined ? {} : { detail: machine.context.detail }),
    refresh: () => send({ type: "refresh" }),
    applyUpdate: () => send({ type: "apply" }),
  };
};
