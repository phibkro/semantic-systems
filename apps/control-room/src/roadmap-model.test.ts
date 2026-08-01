import { NodeFileSystem, NodePath } from "@effect/platform-node";
import { Effect } from "effect";
import { resolve } from "node:path";
import { beforeAll, describe, expect, test } from "vitest";
import type { PortfolioDocument, SavedView } from "../../../src/portfolio-model/decode.ts";
import { loadPortfolio } from "../../../src/portfolio-model/index.ts";
import {
  deriveRoadmapModel,
  InvalidContainmentTopology,
  RoadmapModelFailure,
} from "./roadmap-model.ts";

let document: PortfolioDocument;

beforeAll(async () => {
  document = await Effect.runPromise(
    loadPortfolio(resolve(import.meta.dirname, "../../..")).pipe(
      Effect.provide([NodeFileSystem.layer, NodePath.layer]),
    ),
  );
});

const derive = (candidate = document) => Effect.runPromise(deriveRoadmapModel(candidate));

const withView = (
  candidate: PortfolioDocument,
  id: string,
  update: (view: SavedView) => SavedView,
): PortfolioDocument => ({
  ...candidate,
  views: candidate.views.map((view) => (view.id === id ? update(view) : view)),
});

describe("declared roadmap model", () => {
  test("derives a deeply immutable deterministic model without mutating the document", async () => {
    const before = JSON.stringify(document);
    const expected = await derive();
    const permuted: PortfolioDocument = {
      ...document,
      projects: document.projects.toReversed(),
      work: document.work.toReversed(),
      relations: document.relations.toReversed(),
      views: document.views.toReversed(),
    };
    const observed = await derive(permuted);

    expect(observed).toEqual(expected);
    expect(JSON.stringify(document)).toBe(before);
    expect(Object.isFrozen(expected)).toBe(true);
    expect(Object.isFrozen(expected.nodes)).toBe(true);
    expect(Object.isFrozen(expected.nodes[0]?.position)).toBe(true);
    expect(Object.isFrozen(expected.nodes[0]?.prerequisite_ids)).toBe(true);
    expect(expected.work_identities).toEqual(expected.work_identities.toSorted());
    expect(expected.projection_sources).toMatchObject({
      graph: { view_id: "view.roadmap", identity_ids: expected.work_identities },
      mosaic: { view_id: "view.roadmap-mosaic", identity_ids: expected.work_identities },
    });
    expect(expected.accessible_targets.filter(({ kind }) => kind === "project")).toHaveLength(
      expected.projects.length,
    );
    expect(
      expected.accessible_targets.filter(({ kind }) => ["milestone", "feature"].includes(kind)),
    ).toHaveLength(expected.work_identities.length);
    expect(expected.accessible_targets.filter(({ kind }) => kind === "dependency")).toHaveLength(
      expected.dependency_edges.length,
    );
  });

  test("uses requires alone for depth, adjacency, and prerequisite-to-dependent arrows", async () => {
    const model = await derive();
    const nodes = new Map(model.nodes.map((node) => [node.id, node]));
    const selected = new Set(model.work_identities);
    const requires = document.relations.filter(
      ({ kind, source_id, target_id }) =>
        kind === "requires" && selected.has(source_id) && selected.has(target_id),
    );

    expect(model.dependency_edges).toHaveLength(requires.length);
    for (const relation of requires) {
      const edge = model.dependency_edges.find(({ id }) => id === relation.id)!;
      expect(edge).toEqual({
        id: relation.id,
        dependent_id: relation.source_id,
        prerequisite_id: relation.target_id,
        visual_source_id: relation.target_id,
        visual_target_id: relation.source_id,
      });
      expect(nodes.get(edge.prerequisite_id)!.depth).toBeLessThan(
        nodes.get(edge.dependent_id)!.depth,
      );
      expect(nodes.get(edge.dependent_id)!.prerequisite_ids).toContain(edge.prerequisite_id);
      expect(nodes.get(edge.prerequisite_id)!.unlock_ids).toContain(edge.dependent_id);
    }

    const containmentIds = new Set(model.containment_edges.map(({ id }) => id));
    expect(model.dependency_edges.every(({ id }) => !containmentIds.has(id))).toBe(true);
  });

  test("keeps containment and project hierarchy orthogonal to dependency layout", async () => {
    const model = await derive();
    const nodes = new Map(model.nodes.map((node) => [node.id, node]));
    for (const edge of model.containment_edges) {
      expect(nodes.get(edge.contained_id)!.container_ids).toContain(edge.container_id);
      expect(nodes.get(edge.container_id)!.contained_ids).toContain(edge.contained_id);
    }
    for (const project of model.projects) {
      expect(
        project.identity_ids.every((id) => nodes.get(id)?.project_id === project.project_id),
      ).toBe(true);
      expect(project.milestone_ids.every((id) => nodes.get(id)?.kind === "milestone")).toBe(true);
      expect(
        project.standalone_feature_ids.every(
          (id) => nodes.get(id)?.kind === "feature" && nodes.get(id)?.container_ids.length === 0,
        ),
      ).toBe(true);
    }
  });

  test("orders lanes by UTF-16 identity and ignores priority, effort, and insertion order", async () => {
    const baseline = await derive();
    const changed: PortfolioDocument = {
      ...document,
      work: document.work.toReversed().map((work) =>
        Object.assign({}, work, {
          attributes: Object.assign({}, work.attributes, { "work.effort": 999_999 }),
        }),
      ),
      priorities: document.priorities
        .toReversed()
        .map((priority, index) => Object.assign({}, priority, { rank: index + 1 })),
    };
    const observed = await derive(changed);
    expect(
      observed.nodes.map(({ id, depth, lane, position }) => ({ id, depth, lane, position })),
    ).toEqual(
      baseline.nodes.map(({ id, depth, lane, position }) => ({ id, depth, lane, position })),
    );
    for (const depth of new Set(observed.nodes.map((node) => node.depth))) {
      const row = observed.nodes
        .filter((node) => node.depth === depth)
        .toSorted((a, b) => a.lane - b.lane);
      expect(row.map(({ id }) => id)).toEqual(row.map(({ id }) => id).toSorted());
    }
  });

  test("rejects missing, wrong-presentation, and mismatched saved views as typed failures", async () => {
    const missing: PortfolioDocument = {
      ...document,
      views: document.views.filter(({ id }) => id !== "view.roadmap"),
    };
    const wrong = withView(document, "view.roadmap", (view) => ({
      ...view,
      presentation: "graph",
    }));
    const mismatched = withView(document, "view.roadmap-mosaic", (view) => ({
      ...view,
      query: {
        ...view.query,
        where: [{ field: "status", operator: "equals", value: "accepted" }],
      },
    }));

    for (const candidate of [missing, wrong, mismatched]) {
      const failure = await Effect.runPromise(deriveRoadmapModel(candidate).pipe(Effect.flip));
      expect(failure).toBeInstanceOf(RoadmapModelFailure);
    }
  });

  test("derives the maximum 2,048-node requires chain iteratively", async () => {
    const count = 2_048;
    const ids = Array.from(
      { length: count },
      (_, index) => `work.${index.toString().padStart(4, "0")}`,
    );
    const project = document.projects[0]!;
    const template = document.work[0]!;
    const chain: PortfolioDocument = {
      ...document,
      projects: [project],
      work: ids.map((id) => ({
        ...template,
        id,
        project_id: project.id,
        kind: "feature",
        title: id,
        attributes: {},
      })),
      relations: ids.slice(1).map((id, index) => ({
        id: `relation.chain.${index.toString().padStart(4, "0")}`,
        source_id: id,
        target_id: ids[index]!,
        kind: "requires",
        summary: "Declared chain dependency.",
      })),
      memberships: [],
      artifacts: [],
      priorities: [],
      receipts: [],
      snapshots: [],
    };
    const model = await derive(chain);
    expect(model.nodes).toHaveLength(count);
    expect(model.nodes.find(({ id }) => id === ids.at(-1))?.depth).toBe(count - 1);
  });

  test("rejects invalid selected containment topology with a distinct typed failure", async () => {
    const model = await derive();
    const features = model.nodes.filter(({ kind }) => kind === "feature");
    const milestones = model.nodes.filter(({ kind }) => kind === "milestone");
    const sameProjectFeatures = features.filter(
      ({ project_id }) => project_id === features[0]?.project_id,
    );
    const nonMilestone: PortfolioDocument = {
      ...document,
      relations: [
        ...document.relations,
        {
          id: "relation.invalid-container",
          source_id: sameProjectFeatures[0]!.id,
          target_id: sameProjectFeatures[1]!.id,
          kind: "contains",
          summary: "Invalid feature container.",
        },
      ],
    };
    const sameProjectPair = milestones.find((milestone) =>
      features.some((feature) => feature.project_id === milestone.project_id),
    )!;
    const child = features.find(({ project_id }) => project_id === sameProjectPair.project_id)!;
    const cyclic: PortfolioDocument = {
      ...document,
      relations: [
        ...document.relations,
        {
          id: "relation.cycle-forward",
          source_id: sameProjectPair.id,
          target_id: child.id,
          kind: "contains",
          summary: "Cycle forward.",
        },
        {
          id: "relation.cycle-back",
          source_id: child.id,
          target_id: sameProjectPair.id,
          kind: "contains",
          summary: "Cycle back.",
        },
      ],
    };

    const invalidFailure = await Effect.runPromise(
      deriveRoadmapModel(nonMilestone).pipe(Effect.flip),
    );
    expect(invalidFailure).toBeInstanceOf(InvalidContainmentTopology);
    if (!(invalidFailure instanceof InvalidContainmentTopology)) throw invalidFailure;
    expect(invalidFailure.reason).toBe("non-milestone-container");
    const cycleFailure = await Effect.runPromise(deriveRoadmapModel(cyclic).pipe(Effect.flip));
    expect(cycleFailure).toBeInstanceOf(InvalidContainmentTopology);
    if (!(cycleFailure instanceof InvalidContainmentTopology)) throw cycleFailure;
    expect(cycleFailure.reason).toBe("cycle");
  });
});
