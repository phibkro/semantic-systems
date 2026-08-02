import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test } from "vitest";
import App from "./App.tsx";
import { fixtureObservationReport, fixtureSnapshot } from "./test/fixture.ts";

const provided = {
  state: "current" as const,
  snapshot: fixtureSnapshot,
  pending: null,
};

describe("phone-first Control Room", () => {
  test("exposes six views, exact provenance, unsupported claims, and completed work", () => {
    render(<App provided={provided} />);
    for (const view of ["Pulse", "Systems", "Semantics", "Evidence", "Work", "Agents"]) {
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

  test("projects agent observations without a write or status-transition control", async () => {
    const user = userEvent.setup();
    render(<App provided={provided} providedObservations={fixtureObservationReport} />);
    await user.click(screen.getByRole("button", { name: "Agents" }));

    const observations = screen.getByRole("region", { name: "Agent observations" });
    expect(within(observations).getByText("bounded-model-call")).toBeVisible();
    expect(within(observations).getByText("attempt.42")).toBeVisible();
    expect(within(observations).getByText("semantic correctness of an agent action")).toBeVisible();
    expect(within(observations).getByText("langfuse-project")).toBeVisible();
    expect(within(observations).getByText(/2026-08-02T10:00:00.000Z/)).toBeVisible();
    expect(within(observations).getByText(/2026-08-02T11:00:00.000Z/)).toBeVisible();
    expect(within(observations).queryByRole("button")).toBeNull();
    expect(within(observations).queryByRole("link")).toBeNull();
    expect(within(observations).queryByRole("form")).toBeNull();
  });

  test("keeps an independently supplied observation report visible without a semantic snapshot", async () => {
    const user = userEvent.setup();
    render(
      <App
        provided={{ state: "invalid", snapshot: null, pending: null }}
        providedObservations={fixtureObservationReport}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Agents" }));

    expect(screen.getByRole("region", { name: "Agent observations" })).toBeVisible();
    expect(screen.getByText("bounded-model-call")).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Unavailable" })).toBeNull();
  });
});
