import { setup } from "xstate";

export type ControlRoomScope = "portfolio" | "semantic";

export const controlRoomMachine = setup({
  types: {
    context: {} as { readonly initialScope: ControlRoomScope },
    input: {} as { readonly scope: ControlRoomScope },
    events: {} as { readonly type: "scope.portfolio" } | { readonly type: "scope.semantic" },
  },
  guards: {
    startsInPortfolio: ({ context }) => context.initialScope === "portfolio",
  },
}).createMachine({
  id: "control-room-shell",
  initial: "choosing",
  context: ({ input }) => ({ initialScope: input.scope }),
  states: {
    choosing: {
      always: [{ guard: "startsInPortfolio", target: "portfolio" }, { target: "semantic" }],
    },
    portfolio: { on: { "scope.semantic": "semantic" } },
    semantic: { on: { "scope.portfolio": "portfolio" } },
  },
});
