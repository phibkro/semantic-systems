import { NodeFileSystem, NodePath } from "@effect/platform-node";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Effect } from "effect";
import { resolve } from "node:path";
import { beforeAll, describe, expect, test } from "vitest";
import { loadPortfolio, type PortfolioDocument } from "../../../../../src/portfolio-model/index.ts";
import Portfolio from "../../Portfolio.tsx";
import type { PortfolioState } from "../../portfolio-snapshot.ts";

let document: PortfolioDocument;

beforeAll(async () => {
  document = await Effect.runPromise(
    loadPortfolio(resolve(process.cwd(), "../..")).pipe(
      Effect.provide([NodeFileSystem.layer, NodePath.layer]),
    ),
  );
});

const currentPortfolio = (): PortfolioState => ({
  state: "current",
  snapshot: {
    schema_version: "pbk.portfolio-public/v1",
    metadata: {
      commit: "0".repeat(40),
      digest: "1".repeat(64),
      observed_at: "2026-08-01T00:00:00Z",
      freshness_seconds: 300,
    },
    document,
  },
  pending: null,
});

describe("interactive roadmap projections", () => {
  test("renders a read-only prerequisite canvas and equivalent ordered controls", async () => {
    const user = userEvent.setup();
    render(<Portfolio provided={currentPortfolio()} />);
    await user.click(screen.getByRole("tab", { name: /Roadmap/ }));

    expect(await screen.findByLabelText("Interactive prerequisite skill tree")).toBeVisible();
    const orderedNodes = await screen.findByRole("list", { name: "Ordered roadmap work nodes" });
    expect(within(orderedNodes).getAllByRole("button")).toHaveLength(document.work.length);
    const dependencies = screen.getByRole("list", {
      name: "Ordered roadmap dependency links",
    });
    expect(within(dependencies).getAllByText("requires").length).toBeGreaterThan(0);

    const firstWork = within(orderedNodes).getAllByRole("button")[0]!;
    await user.click(firstWork);
    expect(screen.getByRole("dialog")).toContainElement(
      screen.getByRole("heading", { name: firstWork.textContent ?? "" }),
    );
  });

  test("opens exact detail and preserves focus through Graph and Mosaic changes", async () => {
    const user = userEvent.setup();
    render(<Portfolio provided={currentPortfolio()} />);
    await user.click(screen.getByRole("tab", { name: /Roadmap/ }));
    const orderedNodes = await screen.findByRole("list", { name: "Ordered roadmap work nodes" });
    const selectedTitle = within(orderedNodes).getAllByRole("button")[0]!.textContent!;
    await user.click(within(orderedNodes).getAllByRole("button")[0]!);
    expect(screen.getByRole("dialog")).toHaveTextContent(selectedTitle);
    await user.keyboard("{Escape}");

    await user.click(screen.getByRole("tab", { name: "Mosaic" }));
    await user.click(screen.getAllByRole("button", { name: "Focus project" })[0]!);
    const containmentFocus = screen.queryAllByRole("button", {
      name: "Focus authored containment",
    })[0];
    if (containmentFocus !== undefined) await user.click(containmentFocus);
    await user.click(screen.getByRole("tab", { name: "Graph" }));
    await user.click(screen.getByRole("tab", { name: "Mosaic" }));
    expect(screen.getByRole("navigation", { name: "Mosaic focus path" })).not.toHaveTextContent(
      /^PBK Technologies$/,
    );
    if (containmentFocus !== undefined) {
      expect(
        screen.getAllByRole("button", { name: "Clear containment focus" }).length,
      ).toBeGreaterThan(0);
    }
  });

  test("keeps graph membership unchanged while Mosaic changes information density", async () => {
    const user = userEvent.setup();
    render(<Portfolio provided={currentPortfolio()} />);
    await user.click(screen.getByRole("tab", { name: /Roadmap/ }));
    const orderedNodes = await screen.findByRole("list", { name: "Ordered roadmap work nodes" });
    const initialCount = within(orderedNodes).getAllByRole("button").length;
    await user.click(screen.getByRole("tab", { name: "Mosaic" }));
    await user.click(screen.getAllByRole("button", { name: "Focus project" })[0]!);
    expect(
      within(screen.getByRole("list", { name: "Ordered roadmap work nodes" })).getAllByRole(
        "button",
      ),
    ).toHaveLength(initialCount);
  });
});
