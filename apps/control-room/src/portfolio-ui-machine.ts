import { assign, setup } from "xstate";

export type PortfolioView = "overview" | "board" | "features" | "roadmap" | "history";
export type RoadmapMode = "graph" | "mosaic";

interface PortfolioUiContext {
  readonly selectedId: string | null;
  readonly focusProject: string | null;
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
  | { readonly type: "project.clear" };

export const portfolioUiMachine = setup({
  types: {
    context: {} as PortfolioUiContext,
    events: {} as PortfolioUiEvent,
  },
  actions: {
    closeWork: assign({ selectedId: () => null }),
    selectWork: assign({
      selectedId: ({ event }) => (event.type === "work.select" ? event.id : null),
    }),
    focusProject: assign({
      focusProject: ({ event }) => (event.type === "project.focus" ? event.id : null),
    }),
    clearProject: assign({ focusProject: () => null }),
  },
}).createMachine({
  id: "portfolio-ui",
  initial: "overview",
  context: { selectedId: null, focusProject: null },
  on: {
    "work.select": { actions: "selectWork" },
    "work.close": { actions: "closeWork" },
    "project.focus": { actions: "focusProject" },
    "project.clear": { actions: "clearProject" },
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
