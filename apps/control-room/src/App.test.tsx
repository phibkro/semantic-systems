import { render, screen, within } from "@testing-library/react";
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
    expect(screen.getByText("Current")).toBeVisible();
  });

  it("supports search, drilldown, typed relations, assumptions, and provenance", async () => {
    const user = userEvent.setup();
    render(<App provided={provided} />);

    await user.click(screen.getByRole("button", { name: "Evidence" }));
    await user.type(screen.getByRole("searchbox", { name: "Search evidence" }), "Example");
    await user.click(screen.getByRole("button", { name: /Example evidence/ }));

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("evidence: example_test")).toBeVisible();
    expect(within(dialog).getByText("Fixture scope only")).toBeVisible();
    expect(
      within(dialog).getByRole("link", { name: "Open canonical source at exact commit" }),
    ).toHaveAttribute("href", expect.stringContaining(`/blob/${fixtureSnapshot.metadata.commit}/`));
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
