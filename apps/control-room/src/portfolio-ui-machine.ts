import { assign, setup } from "xstate";

export type PortfolioView = "overview" | "board" | "features" | "roadmap" | "history";
export type RoadmapMode = "graph" | "mosaic";

export interface PortfolioUiInput {
  readonly work: ReadonlyArray<{
    readonly id: string;
    readonly kind: "milestone" | "feature";
    readonly project_id: string;
  }>;
  readonly projectIds: ReadonlyArray<string>;
  readonly roadmapWorkIds: ReadonlyArray<string>;
}

interface PortfolioUiContext {
  readonly selectedId: string | null;
  readonly focusProject: string | null;
  readonly focusMilestone: string | null;
  readonly work: PortfolioUiInput["work"];
  readonly projectIds: ReadonlyArray<string>;
  readonly roadmapWorkIds: ReadonlyArray<string>;
}

type PortfolioUiEvent =
  | { readonly type: "view.overview" }
  | { readonly type: "view.board" }
  | { readonly type: "view.features" }
  | { readonly type: "view.roadmap" }
  | { readonly type: "view.history" }
  | { readonly type: "roadmap.graph" }
  | { readonly type: "roadmap.mosaic" }
  | { readonly type: "work.select"; readonly id: string }
  | { readonly type: "work.close" }
  | { readonly type: "project.focus"; readonly id: string }
  | { readonly type: "project.clear" }
  | { readonly type: "milestone.focus"; readonly id: string }
  | { readonly type: "milestone.clear" };

export const portfolioUiMachine = setup({
  types: {
    context: {} as PortfolioUiContext,
    events: {} as PortfolioUiEvent,
    input: {} as PortfolioUiInput,
  },
  guards: {
    knownWork: ({ context, event }) =>
      event.type === "work.select" && context.work.some(({ id }) => id === event.id),
    knownProject: ({ context, event }) =>
      event.type === "project.focus" && context.projectIds.includes(event.id),
    knownMilestoneInFocus: ({ context, event }) =>
      event.type === "milestone.focus" &&
      context.roadmapWorkIds.includes(event.id) &&
      context.work.some(
        ({ id, kind, project_id }) =>
          id === event.id && kind === "milestone" && project_id === context.focusProject,
      ),
  },
  actions: {
    closeWork: assign({ selectedId: () => null }),
    selectWork: assign({
      selectedId: ({ event }) => (event.type === "work.select" ? event.id : null),
    }),
    focusProject: assign({
      focusProject: ({ event }) => (event.type === "project.focus" ? event.id : null),
      focusMilestone: () => null,
    }),
    clearProject: assign({ focusProject: () => null, focusMilestone: () => null }),
    focusMilestone: assign({
      focusMilestone: ({ event }) => (event.type === "milestone.focus" ? event.id : null),
    }),
    clearMilestone: assign({ focusMilestone: () => null }),
  },
}).createMachine({
  id: "portfolio-ui",
  initial: "overview",
  context: ({ input }) => ({
    selectedId: null,
    focusProject: null,
    focusMilestone: null,
    work: input.work,
    projectIds: input.projectIds,
    roadmapWorkIds: input.roadmapWorkIds,
  }),
  on: {
    "work.select": { guard: "knownWork", actions: "selectWork" },
    "work.close": { actions: "closeWork" },
  },
  states: {
    overview: {
      on: {
        "view.board": { target: "board", actions: "closeWork" },
        "view.features": { target: "features", actions: "closeWork" },
        "view.roadmap": { target: "roadmap", actions: "closeWork" },
        "view.history": { target: "history", actions: "closeWork" },
      },
    },
    board: {
      on: {
        "view.overview": { target: "overview", actions: "closeWork" },
        "view.features": { target: "features", actions: "closeWork" },
        "view.roadmap": { target: "roadmap", actions: "closeWork" },
        "view.history": { target: "history", actions: "closeWork" },
      },
    },
    features: {
      on: {
        "view.overview": { target: "overview", actions: "closeWork" },
        "view.board": { target: "board", actions: "closeWork" },
        "view.roadmap": { target: "roadmap", actions: "closeWork" },
        "view.history": { target: "history", actions: "closeWork" },
      },
    },
    roadmap: {
      initial: "graph",
      on: {
        "project.focus": { guard: "knownProject", actions: "focusProject" },
        "project.clear": { actions: "clearProject" },
        "milestone.focus": { guard: "knownMilestoneInFocus", actions: "focusMilestone" },
        "milestone.clear": { actions: "clearMilestone" },
        "view.overview": { target: "overview", actions: "closeWork" },
        "view.board": { target: "board", actions: "closeWork" },
        "view.features": { target: "features", actions: "closeWork" },
        "view.history": { target: "history", actions: "closeWork" },
      },
      states: {
        graph: { on: { "roadmap.mosaic": "mosaic" } },
        mosaic: { on: { "roadmap.graph": "graph" } },
      },
    },
    history: {
      on: {
        "view.overview": { target: "overview", actions: "closeWork" },
        "view.board": { target: "board", actions: "closeWork" },
        "view.features": { target: "features", actions: "closeWork" },
        "view.roadmap": { target: "roadmap", actions: "closeWork" },
      },
    },
  },
});
