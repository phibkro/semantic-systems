import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import App from "./App";
import { fixtureSnapshot } from "./test/fixture";

const provided = {
  state: "current" as const,
  snapshot: fixtureSnapshot,
  pending: null,
};

describe("phone-first Control Room", () => {
  it("exposes all five orthogonal views and exact observation metadata", () => {
    render(<App provided={provided} />);

    for (const view of ["Pulse", "Systems", "Semantics", "Evidence", "Work"]) {
      expect(screen.getByRole("button", { name: view })).toBeVisible();
    }
    expect(screen.getByText(fixtureSnapshot.metadata.commit)).toBeVisible();
    expect(screen.getByText(fixtureSnapshot.metadata.digest)).toBeVisible();
    expect(screen.getByText("Local preview")).toBeVisible();
    expect(screen.getByText(/accepted-main deployment not claimed/)).toBeVisible();
    expect(screen.getByRole("heading", { name: "Unsupported claims (1)" })).toBeVisible();
    expect(screen.getByText("claim.unsupported", { exact: false })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Completed work (1)" })).toBeVisible();
  });

  it("supports search, drilldown, typed relations, assumptions, and provenance", async () => {
    const user = userEvent.setup();
    render(<App provided={provided} />);

    await user.click(screen.getByRole("button", { name: "Evidence" }));
    await user.type(screen.getByRole("searchbox", { name: "Search evidence" }), "Example");
    const entityButton = screen.getByRole("button", { name: /Example evidence/ });
    await user.click(entityButton);

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("button", { name: "Close details" })).toHaveFocus();
    expect(within(dialog).getByText("evidence: example_test")).toBeVisible();
    expect(within(dialog).getByText("Fixture scope only")).toBeVisible();
    expect(
      within(dialog).getByRole("link", { name: "Open canonical source at exact commit" }),
    ).toHaveAttribute("href", expect.stringContaining(`/blob/${fixtureSnapshot.metadata.commit}/`));
    expect(
      within(dialog).getByRole("link", { name: "Open relation source at exact commit" }),
    ).toHaveAttribute("href", expect.stringContaining(`/blob/${fixtureSnapshot.metadata.commit}/`));

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() => expect(entityButton).toHaveFocus());
  });

  it("filters a view by explicit status without relying on search", async () => {
    const user = userEvent.setup();
    render(<App provided={provided} />);

    await user.click(screen.getByRole("button", { name: "Evidence" }));
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Filter evidence by status" }),
      "passing",
    );

    expect(screen.getByRole("button", { name: /Example evidence/ })).toBeVisible();
    expect(screen.queryByRole("button", { name: /window.pwned/ })).not.toBeInTheDocument();
  });

  it("exposes every system kind, recursive containment, and relation-kind filtering", async () => {
    const user = userEvent.setup();
    render(<App provided={provided} />);

    await user.click(screen.getByRole("button", { name: "Systems" }));
    expect(screen.getByRole("heading", { name: "Recursive components" })).toBeVisible();
    expect(screen.getByTestId("tree-component.alpha")).toHaveAttribute("open");
    const child = screen.getByTestId("tree-component.child");
    const childSummary = child.querySelector("summary");
    expect(childSummary).toBeVisible();
    await user.click(childSummary!);
    expect(child).toHaveAttribute("open");
    expect(screen.getByRole("button", { name: /Evidence packet/ })).toBeVisible();

    await user.click(
      within(screen.getByRole("region", { name: "systems entities" })).getByRole("button", {
        name: /Alpha system/,
      }),
    );
    const dialog = screen.getByRole("dialog");
    await user.selectOptions(
      within(dialog).getByRole("combobox", { name: "Filter outgoing relations by kind" }),
      "contains",
    );
    expect(within(dialog).getByText("Alpha recursively contains the child")).toBeVisible();
    expect(within(dialog).queryByText("Alpha implements the theory")).not.toBeInTheDocument();
  });

  it("renders hostile graph text as text rather than executable HTML", async () => {
    const user = userEvent.setup();
    const { container } = render(<App provided={provided} />);

    await user.click(screen.getByRole("button", { name: "Evidence" }));
    expect(screen.getByText("<script>window.pwned=true</script>")).toBeVisible();
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector('img[src="x"]')).toBeNull();
  });
});
