import { createActor } from "xstate";
import { describe, expect, test } from "vitest";
import { portfolioUiMachine, type PortfolioUiInput } from "./portfolio-ui-machine.ts";

const input: PortfolioUiInput = {
  projectIds: ["project.alpha", "project.beta"],
  roadmapWorkIds: ["work.alpha-milestone", "work.alpha-feature", "work.beta-milestone"],
  work: [
    { id: "work.alpha-milestone", kind: "milestone", project_id: "project.alpha" },
    { id: "work.alpha-feature", kind: "feature", project_id: "project.alpha" },
    { id: "work.beta-milestone", kind: "milestone", project_id: "project.beta" },
    { id: "work.outside-roadmap", kind: "feature", project_id: "project.alpha" },
  ],
};

const actor = () => createActor(portfolioUiMachine, { input }).start();

describe("portfolio roadmap UI machine", () => {
  test("preserves selected work and focus across graph and Mosaic", () => {
    const service = actor();
    service.send({ type: "view.roadmap" });
    service.send({ type: "project.focus", id: "project.alpha" });
    service.send({ type: "milestone.focus", id: "work.alpha-milestone" });
    service.send({ type: "work.select", id: "work.alpha-feature" });
    service.send({ type: "roadmap.mosaic" });

    expect(service.getSnapshot().matches({ roadmap: "mosaic" })).toBe(true);
    expect(service.getSnapshot().context).toMatchObject({
      selectedId: "work.alpha-feature",
      focusProject: "project.alpha",
      focusMilestone: "work.alpha-milestone",
    });

    service.send({ type: "roadmap.graph" });
    expect(service.getSnapshot().context.selectedId).toBe("work.alpha-feature");
    expect(service.getSnapshot().context.focusMilestone).toBe("work.alpha-milestone");
    service.stop();
  });

  test("rejects unknown, wrong-kind, and project-mismatched focus identities", () => {
    const service = actor();
    service.send({ type: "view.roadmap" });
    service.send({ type: "project.focus", id: "project.unknown" });
    expect(service.getSnapshot().context.focusProject).toBeNull();

    service.send({ type: "project.focus", id: "project.alpha" });
    for (const id of ["work.unknown", "work.alpha-feature", "work.beta-milestone"]) {
      service.send({ type: "milestone.focus", id });
      expect(service.getSnapshot().context.focusMilestone).toBeNull();
    }
    service.send({ type: "work.select", id: "work.unknown" });
    expect(service.getSnapshot().context.selectedId).toBeNull();
    service.stop();
  });

  test("keeps roadmap-only commands inert elsewhere and accepts any known detail identity", () => {
    const service = actor();
    service.send({ type: "project.focus", id: "project.alpha" });
    service.send({ type: "roadmap.mosaic" });
    expect(service.getSnapshot().matches("overview")).toBe(true);
    expect(service.getSnapshot().context.focusProject).toBeNull();

    service.send({ type: "work.select", id: "work.outside-roadmap" });
    expect(service.getSnapshot().context.selectedId).toBe("work.outside-roadmap");
    service.stop();
  });

  test("clearing project also clears narrower milestone focus but not selection", () => {
    const service = actor();
    service.send({ type: "view.roadmap" });
    service.send({ type: "project.focus", id: "project.alpha" });
    service.send({ type: "milestone.focus", id: "work.alpha-milestone" });
    service.send({ type: "work.select", id: "work.alpha-feature" });
    service.send({ type: "project.clear" });
    expect(service.getSnapshot().context).toMatchObject({
      selectedId: "work.alpha-feature",
      focusProject: null,
      focusMilestone: null,
    });
    service.stop();
  });
});
