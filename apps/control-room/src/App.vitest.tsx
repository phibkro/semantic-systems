import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test } from "vitest";
import App from "./App.tsx";
import { fixtureSnapshot } from "./test/fixture.ts";

const provided = {
  state: "current" as const,
  snapshot: fixtureSnapshot,
  pending: null,
};

describe("phone-first Control Room", () => {
  test("exposes five views, exact provenance, unsupported claims, and completed work", () => {
    render(<App provided={provided} />);
    for (const view of ["Pulse", "Systems", "Semantics", "Evidence", "Work"]) {
      expect(screen.getByRole("button", { name: view })).toBeVisible();
    }
    expect(screen.getByText(fixtureSnapshot.metadata.commit)).toBeVisible();
    expect(screen.getByText(fixtureSnapshot.metadata.digest)).toBeVisible();
    expect(screen.getByText("Local preview")).toBeVisible();
    expect(screen.getByRole("heading", { name: /Unsupported claims/ })).toBeVisible();
    expect(screen.getByRole("heading", { name: /Completed work/ })).toBeVisible();
  });

  test("supports query, drill-down, typed relations, assumptions, and exact source links", async () => {
    const user = userEvent.setup();
    render(<App provided={provided} />);
    await user.click(screen.getByRole("button", { name: "Evidence" }));
    await user.type(screen.getByRole("searchbox", { name: "Search evidence" }), "Example");
    await user.click(screen.getByRole("button", { name: /Example evidence/ }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Fixture scope only")).toBeVisible();
    expect(within(dialog).getByText("evidence: example_test")).toBeVisible();
    expect(
      within(dialog).getByRole("link", { name: "Open canonical source at exact commit" }),
    ).toHaveAttribute("href", expect.stringContaining(`/blob/${fixtureSnapshot.metadata.commit}/`));
    expect(
      within(dialog).getByRole("link", { name: "Open relation source at exact commit" }),
    ).toHaveAttribute("href", expect.stringContaining(`/blob/${fixtureSnapshot.metadata.commit}/`));
  });

  test("shows canonical ready and blocked identities without inferring them", async () => {
    const user = userEvent.setup();
    render(<App provided={provided} />);
    await user.click(screen.getByRole("button", { name: "Work" }));
    const frontier = within(screen.getByRole("region", { name: "Canonical work frontier" }));
    expect(frontier.getByRole("heading", { name: /Ready frontier/ })).toBeVisible();
    expect(frontier.getByRole("button", { name: /Ready work/ })).toBeVisible();
    expect(frontier.getByRole("heading", { name: /Scheduler-blocked work/ })).toBeVisible();
    expect(frontier.getByRole("button", { name: /Blocked work/ })).toBeVisible();
    expect(screen.getByText(/does not infer readiness/)).toBeVisible();
  });

  test("renders hostile graph content as text", async () => {
    const user = userEvent.setup();
    const { container } = render(<App provided={provided} />);
    await user.click(screen.getByRole("button", { name: "Evidence" }));
    expect(screen.getByText("<script>window.pwned=true</script>")).toBeVisible();
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector('img[src="x"]')).toBeNull();
  });
});
