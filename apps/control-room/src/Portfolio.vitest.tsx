import { NodeFileSystem, NodePath } from "@effect/platform-node";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Effect } from "effect";
import { resolve } from "node:path";
import { beforeAll, describe, expect, test } from "vitest";
import { loadPortfolio, type PortfolioDocument } from "../../../src/portfolio-model/index.ts";
import Portfolio from "./Portfolio.tsx";
import type { PortfolioState } from "./portfolio-snapshot.ts";

let document: PortfolioDocument;

beforeAll(async () => {
  const root = resolve(process.cwd(), "../..");
  document = await Effect.runPromise(
    loadPortfolio(root).pipe(Effect.provide([NodeFileSystem.layer, NodePath.layer])),
  );
});

const currentPortfolio = (): PortfolioState => ({
  state: "current",
  snapshot: {
    schema_version: "pbk.portfolio-public/v1",
    metadata: {
      commit: "0".repeat(40),
      digest: "1".repeat(64),
      observed_at: "2026-07-31T15:30:00Z",
      freshness_seconds: 300,
    },
    document,
  },
  pending: null,
});

describe("PBK portfolio Control Room", () => {
  test("projects one value through five phone-first views", () => {
    render(<Portfolio provided={currentPortfolio()} />);
    for (const view of ["Overview", "Board", "Features", "Roadmap", "History"]) {
      expect(screen.getByRole("tab", { name: new RegExp(view) })).toBeVisible();
    }
    expect(screen.getByText("8", { selector: "strong" })).toBeVisible();
    expect(screen.getByText("PBK Technologies", { selector: "span" })).toBeVisible();
  });

  test("keeps priority distinct from a scheduler blocker on the board", async () => {
    const user = userEvent.setup();
    render(<Portfolio provided={currentPortfolio()} />);
    await user.click(screen.getByRole("tab", { name: /Board/ }));
    const board = screen.getByLabelText("PBK working horizon board");
    expect(within(board).getAllByText("blocked").length).toBeGreaterThan(0);
    expect(within(board).getByRole("button", { name: /Workgraph product journeys/ })).toBeVisible();
  });

  test("preserves work identity across graph and mosaic projections", async () => {
    const user = userEvent.setup();
    render(<Portfolio provided={currentPortfolio()} />);
    await user.click(screen.getByRole("tab", { name: /Roadmap/ }));
    expect(
      screen.getAllByRole("button", { name: /Agent-facing kernel JSON/ }).length,
    ).toBeGreaterThan(0);
    await user.click(screen.getByRole("tab", { name: "Mosaic" }));
    expect(
      screen.getAllByRole("button", { name: /Agent-facing kernel JSON/ }).length,
    ).toBeGreaterThan(0);
  });

  test("opens the same work value with done criteria and exact artifacts", async () => {
    const user = userEvent.setup();
    render(<Portfolio provided={currentPortfolio()} />);
    await user.click(screen.getByRole("button", { name: /PBK portfolio Control Room/ }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "Definition of done" })).toBeVisible();
    expect(within(dialog).getByRole("heading", { name: /Research, design/ })).toBeVisible();
    expect(
      within(dialog).getByRole("link", { name: "PBK portfolio Control Room contract" }),
    ).toBeVisible();
  });
});
