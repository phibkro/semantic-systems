import { assign, fromCallback, fromPromise, setup } from "xstate";
import type { PortfolioDocument } from "../../../src/portfolio-model/decode.ts";
import type {
  PublicPortfolioSnapshot,
  PublicPortfolioVersion,
} from "../../../src/portfolio-model/public-export.ts";
import {
  PortfolioCandidateError,
  fetchPortfolioCandidate,
  isPortfolioRollback,
  portfolioFreshnessState,
  readCachedPortfolio,
  writeCachedPortfolio,
} from "./portfolio-snapshot.ts";

interface PortfolioCandidate {
  readonly version: PublicPortfolioVersion;
  readonly snapshot: PublicPortfolioSnapshot;
}

export interface PortfolioMachineInput {
  readonly baseUrl: URL;
  readonly browser: Window;
  readonly online: boolean;
  readonly storage: Storage;
}

interface PortfolioMachineContext extends PortfolioMachineInput {
  readonly snapshot: PublicPortfolioSnapshot | null;
  readonly pending: PublicPortfolioSnapshot | null;
  readonly candidate: PortfolioCandidate | null;
  readonly detail?: string;
}

type PortfolioMachineEvent =
  | { readonly type: "refresh" }
  | { readonly type: "apply" }
  | { readonly type: "online" }
  | { readonly type: "offline" };

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : "portfolio refresh failed";

export const portfolioMachine = setup({
  types: {
    context: {} as PortfolioMachineContext,
    events: {} as PortfolioMachineEvent,
    input: {} as PortfolioMachineInput,
  },
  actors: {
    observeBrowser: fromCallback<
      PortfolioMachineEvent,
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
    hydrate: fromPromise<PublicPortfolioSnapshot | null, { readonly storage: Storage }>(
      ({ input }) => readCachedPortfolio(input.storage),
    ),
    fetchCandidate: fromPromise<
      PortfolioCandidate,
      {
        readonly baseUrl: URL;
        readonly previous?: PortfolioDocument;
      }
    >(({ input, signal }) => fetchPortfolioCandidate(input.baseUrl, input.previous, signal)),
  },
  actions: {
    rememberHydrated: assign({
      snapshot: ({ event }) =>
        (event as unknown as { readonly output: PublicPortfolioSnapshot | null }).output,
    }),
    rememberCandidate: assign({
      candidate: ({ event }) =>
        (event as unknown as { readonly output: PortfolioCandidate }).output,
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
      if (context.snapshot !== null) writeCachedPortfolio(context.snapshot, context.storage);
    },
    rememberFailure: assign({
      detail: ({ event }) => errorMessage((event as unknown as { readonly error: unknown }).error),
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
        isPortfolioRollback(context.snapshot, context.candidate.version)),
    isOffline: ({ context }) => !context.online,
    isFresh: ({ context }) =>
      context.snapshot !== null &&
      portfolioFreshnessState(context.snapshot, Date.now(), true) === "current",
    failedCandidateWasInvalid: ({ event }) =>
      (event as unknown as { readonly error: unknown }).error instanceof PortfolioCandidateError &&
      (event as unknown as { readonly error: PortfolioCandidateError }).error.kind === "invalid",
  },
}).createMachine({
  id: "portfolio-custody",
  initial: "hydrating",
  invoke: {
    src: "observeBrowser",
    input: ({ context }) => ({ browser: context.browser, pollMs: 60_000 }),
  },
  context: ({ input }) => ({
    ...input,
    snapshot: null,
    pending: null,
    candidate: null,
  }),
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
        input: ({ context }) => ({
          baseUrl: context.baseUrl,
          ...(context.snapshot === null ? {} : { previous: context.snapshot.document }),
        }),
        onDone: { target: "resolving", actions: "rememberCandidate" },
        onError: [
          {
            guard: ({ context, event }) =>
              context.snapshot !== null &&
              event.error instanceof PortfolioCandidateError &&
              event.error.kind === "invalid",
            target: "invalid",
            actions: "rememberFailure",
          },
          {
            guard: ({ context }) => context.snapshot !== null && !context.online,
            target: "offline",
            actions: "rememberFailure",
          },
          {
            guard: "hasSnapshot",
            target: "stale",
            actions: "rememberFailure",
          },
          {
            guard: "failedCandidateWasInvalid",
            target: "invalid",
            actions: "rememberFailure",
          },
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
    adopting: {
      entry: ["adoptCandidate", "persistSnapshot"],
      always: "settling",
    },
    keeping: {
      entry: "retainCurrent",
      always: "settling",
    },
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
