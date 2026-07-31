import { assign, fromCallback, fromPromise, setup } from "xstate";
import type { PublicSnapshot, PublicVersion } from "./model.ts";
import {
  SnapshotCandidateError,
  fetchCandidate,
  freshnessState,
  isRollback,
  readCachedSnapshot,
  writeCachedSnapshot,
} from "./snapshot.ts";

interface SnapshotCandidate {
  readonly version: PublicVersion;
  readonly snapshot: PublicSnapshot;
}

export interface SnapshotMachineInput {
  readonly baseUrl: URL;
  readonly browser: Window;
  readonly online: boolean;
  readonly storage: Storage;
}

interface SnapshotMachineContext extends SnapshotMachineInput {
  readonly snapshot: PublicSnapshot | null;
  readonly pending: PublicSnapshot | null;
  readonly candidate: SnapshotCandidate | null;
  readonly detail?: string;
}

type SnapshotMachineEvent =
  | { readonly type: "refresh" }
  | { readonly type: "apply" }
  | { readonly type: "online" }
  | { readonly type: "offline" };

const eventOutput = <A>(event: unknown): A => (event as { readonly output: A }).output;

const eventError = (event: unknown): unknown => (event as { readonly error: unknown }).error;

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : "snapshot refresh failed";

export const snapshotMachine = setup({
  types: {
    context: {} as SnapshotMachineContext,
    events: {} as SnapshotMachineEvent,
    input: {} as SnapshotMachineInput,
  },
  actors: {
    observeBrowser: fromCallback<
      SnapshotMachineEvent,
      { readonly browser: Window; readonly pollMs: number }
    >(({ input, sendBack }) => {
      const refresh = () => sendBack({ type: "refresh" });
      const markOnline = () => sendBack({ type: "online" });
      const markOffline = () => sendBack({ type: "offline" });
      const timer = input.browser.setInterval(refresh, input.pollMs);
      input.browser.addEventListener("online", markOnline);
      input.browser.addEventListener("offline", markOffline);
      return () => {
        input.browser.clearInterval(timer);
        input.browser.removeEventListener("online", markOnline);
        input.browser.removeEventListener("offline", markOffline);
      };
    }),
    hydrate: fromPromise<PublicSnapshot | null, { readonly storage: Storage }>(({ input }) =>
      readCachedSnapshot(input.storage),
    ),
    fetchCandidate: fromPromise<SnapshotCandidate, { readonly baseUrl: URL }>(({ input, signal }) =>
      fetchCandidate(input.baseUrl, signal),
    ),
  },
  actions: {
    rememberHydrated: assign({
      snapshot: ({ event }) => eventOutput<PublicSnapshot | null>(event),
    }),
    rememberCandidate: assign({
      candidate: ({ event }) => eventOutput<SnapshotCandidate>(event),
      detail: () => undefined,
    }),
    adoptCandidate: assign({
      snapshot: ({ context }) => context.candidate?.snapshot ?? context.snapshot,
      candidate: () => null,
      pending: () => null,
      detail: () => undefined,
    }),
    retainCurrent: assign({
      candidate: () => null,
      pending: () => null,
      detail: () => undefined,
    }),
    stageCandidate: assign({
      pending: ({ context }) => context.candidate?.snapshot ?? null,
      candidate: () => null,
      detail: () => undefined,
    }),
    applyPending: assign({
      snapshot: ({ context }) => context.pending ?? context.snapshot,
      pending: () => null,
      candidate: () => null,
      detail: () => undefined,
    }),
    persistSnapshot: ({ context }) => {
      if (context.snapshot !== null) writeCachedSnapshot(context.snapshot, context.storage);
    },
    rememberFailure: assign({
      detail: ({ event }) => errorMessage(eventError(event)),
      candidate: () => null,
    }),
    markOnline: assign({ online: () => true }),
    markOffline: assign({ online: () => false }),
  },
  guards: {
    hasSnapshot: ({ context }) => context.snapshot !== null,
    hasNoSnapshot: ({ context }) => context.snapshot === null,
    candidateIsCurrentOrRollback: ({ context }) =>
      context.snapshot !== null &&
      context.candidate !== null &&
      (context.candidate.snapshot.metadata.digest === context.snapshot.metadata.digest ||
        isRollback(context.snapshot, context.candidate.version)),
    isOffline: ({ context }) => !context.online,
    isFresh: ({ context }) =>
      context.snapshot !== null && freshnessState(context.snapshot, Date.now(), true) === "current",
    failedCandidateWasInvalid: ({ event }) =>
      eventError(event) instanceof SnapshotCandidateError &&
      (eventError(event) as SnapshotCandidateError).kind === "invalid",
  },
}).createMachine({
  id: "semantic-snapshot-custody",
  initial: "hydrating",
  context: ({ input }) => ({
    ...input,
    snapshot: null,
    pending: null,
    candidate: null,
  }),
  invoke: {
    src: "observeBrowser",
    input: ({ context }) => ({ browser: context.browser, pollMs: 60_000 }),
  },
  on: {
    online: { actions: "markOnline", target: ".settling" },
    offline: [
      { guard: "hasSnapshot", actions: "markOffline", target: ".offline" },
      { actions: "markOffline" },
    ],
  },
  states: {
    hydrating: {
      invoke: {
        src: "hydrate",
        input: ({ context }) => ({ storage: context.storage }),
        onDone: { target: "refreshing", actions: "rememberHydrated" },
        onError: { target: "refreshing" },
      },
    },
    refreshing: {
      invoke: {
        src: "fetchCandidate",
        input: ({ context }) => ({ baseUrl: context.baseUrl }),
        onDone: { target: "resolving", actions: "rememberCandidate" },
        onError: [
          {
            guard: ({ context, event }) =>
              context.snapshot !== null &&
              event.error instanceof SnapshotCandidateError &&
              event.error.kind === "invalid",
            target: "invalid",
            actions: "rememberFailure",
          },
          {
            guard: ({ context }) => context.snapshot !== null && !context.online,
            target: "offline",
            actions: "rememberFailure",
          },
          { guard: "hasSnapshot", target: "stale", actions: "rememberFailure" },
          { guard: "failedCandidateWasInvalid", target: "invalid", actions: "rememberFailure" },
          { target: "unavailable", actions: "rememberFailure" },
        ],
      },
    },
    resolving: {
      always: [
        { guard: "hasNoSnapshot", target: "adopting" },
        { guard: "candidateIsCurrentOrRollback", target: "keeping" },
        { target: "updateAvailable", actions: "stageCandidate" },
      ],
    },
    adopting: { entry: ["adoptCandidate", "persistSnapshot"], always: "settling" },
    keeping: { entry: "retainCurrent", always: "settling" },
    settling: {
      always: [
        { guard: "hasNoSnapshot", target: "unavailable" },
        { guard: "isOffline", target: "offline" },
        { guard: "isFresh", target: "current" },
        { target: "stale" },
      ],
    },
    current: { on: { refresh: "refreshing" } },
    stale: { on: { refresh: "refreshing" } },
    offline: { on: { refresh: "refreshing" } },
    invalid: { on: { refresh: "refreshing" } },
    unavailable: { on: { refresh: "refreshing" } },
    updateAvailable: {
      on: {
        refresh: "refreshing",
        apply: { target: "settling", actions: ["applyPending", "persistSnapshot"] },
      },
    },
  },
});
