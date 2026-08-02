import { BunFileSystem, BunPath } from "@effect/platform-bun";
import { Effect } from "effect";
import * as Graph from "effect/Graph";
import { beforeAll, describe, expect, test } from "bun:test";
import {
  acceptPortfolioUpdate,
  decodePortfolioDocument,
  loadPortfolio,
  normalizeLabelRule,
  projectPortfolio,
  projectWork,
  queryWork,
  type LabelRule,
  type PortfolioDocument,
  type SavedView,
} from "../src/portfolio-model/index.ts";
import {
  buildStableDirectedGraphIndex,
  topologicalStableIds,
} from "../src/portfolio-model/graph-index.ts";

let portfolio: PortfolioDocument;

beforeAll(async () => {
  portfolio = await Effect.runPromise(
    loadPortfolio(process.cwd()).pipe(Effect.provide([BunFileSystem.layer, BunPath.layer])),
  );
});

const rejects = async (input: unknown, message: RegExp): Promise<void> => {
  await expect(Effect.runPromise(decodePortfolioDocument(input))).rejects.toMatchObject({
    message: expect.stringMatching(message),
  });
};

const view = (id: string): SavedView => {
  const found = portfolio.views.find((candidate) => candidate.id === id);
  if (found === undefined) throw new Error(`missing view ${id}`);
  return found;
};

describe("PBK portfolio boundary", () => {
  test("assembles strict rows into a frozen portfolio observation", () => {
    expect(portfolio.studio.name).toBe("PBK Technologies");
    expect(portfolio.projects).toHaveLength(9);
    expect(portfolio.work).toHaveLength(27);
    expect(portfolio.work.some(({ id }) => id === "work.semantic.control-room-skill-tree")).toBe(
      true,
    );
    expect(
      portfolio.work
        .filter(({ id }) =>
          [
            "work.semantic.normalized-core",
            "work.semantic.artifact-store",
            "work.semantic.reachability-receipt",
          ].includes(id),
        )
        .every(({ status }) => status === "accepted"),
    ).toBe(true);
    expect(
      Object.fromEntries(
        portfolio.artifacts
          .filter(({ id }) => id.startsWith("artifact.semantic."))
          .map(({ id, revision }) => [id, revision]),
      ),
    ).toMatchObject({
      "artifact.semantic.normalized-core-spec": "2959681e01df2acc4ea1318b8ce634b9ccf7d10c",
      "artifact.semantic.surface-language-spec": "0302b468cac9f9d8f55d5e68b9a0e50e5fac9ac1",
      "artifact.semantic.artifact-store-spec": "800d70b74c96a476d34b9690374683b1843343b2",
      "artifact.semantic.reachability-receipt-spec": "68417a25f47a9a3f48a8782fae7f598d38a2ccd2",
    });
    expect(
      Object.fromEntries(
        portfolio.receipts
          .filter(({ id }) => id.startsWith("receipt.semantic."))
          .map(({ id, commit }) => [id, commit]),
      ),
    ).toMatchObject({
      "receipt.semantic.normalized-core": "2959681e01df2acc4ea1318b8ce634b9ccf7d10c",
      "receipt.semantic.surface-language": "0302b468cac9f9d8f55d5e68b9a0e50e5fac9ac1",
      "receipt.semantic.artifact-store": "800d70b74c96a476d34b9690374683b1843343b2",
      "receipt.semantic.reachability-receipt": "68417a25f47a9a3f48a8782fae7f598d38a2ccd2",
    });
    expect(Object.isFrozen(portfolio)).toBe(true);
    expect(Object.isFrozen(portfolio.work[0])).toBe(true);
  });

  test("rejects excess fields, missing endpoints, and prerequisite cycles", async () => {
    const excess = structuredClone(portfolio) as PortfolioDocument & {
      deadline?: string;
    };
    excess.deadline = "tomorrow";
    await rejects(excess, /excess property|unexpected/i);

    const missing = {
      ...structuredClone(portfolio),
      relations: portfolio.relations.map((relation, index) =>
        index === 0 ? { ...relation, target_id: "work.missing" } : relation,
      ),
    };
    await rejects(missing, /missing endpoint/);

    const cycle = {
      ...structuredClone(portfolio),
      relations: [
        ...portfolio.relations,
        {
          id: "relation.test.cycle",
          source_id: "work.semantic.kernel-json",
          target_id: "work.semantic.surface-language",
          kind: "requires",
          summary: "Counterexample cycle.",
        },
      ],
    };
    await rejects(cycle, /requires cycle/);
  });

  test("keeps priority separate from dependency readiness", () => {
    const blocked = {
      ...structuredClone(portfolio),
      priorities: [
        ...portfolio.priorities,
        {
          id: "priority.blocked.01",
          work_id: "work.workgraph.journeys",
          rank: 1,
          asserted_at: "2026-07-31T15:29:00Z",
          reason: "Counterexample: priority cannot erase a blocker.",
        },
      ],
    };
    const projected = projectPortfolio(blocked);
    expect(projected.board.blocked).toContain("work.workgraph.journeys");
    expect(projected.board.ready).not.toContain("work.workgraph.journeys");
  });

  test("retains immutable priority, receipt, and snapshot history", async () => {
    const removed = { ...structuredClone(portfolio), receipts: portfolio.receipts.slice(1) };
    await expect(
      Effect.runPromise(acceptPortfolioUpdate(portfolio, removed)),
    ).rejects.toMatchObject({
      message: expect.stringMatching(/receipt history/),
    });

    const appended = {
      ...structuredClone(portfolio),
      priorities: [
        ...portfolio.priorities,
        {
          id: "priority.pbk-control-room.03",
          work_id: "work.semantic.pbk-control-room",
          rank: 2,
          asserted_at: "2026-07-31T20:00:00Z",
          reason: "A later assertion is append-only.",
        },
      ],
    };
    await expect(Effect.runPromise(acceptPortfolioUpdate(portfolio, appended))).resolves.toBe(
      appended,
    );
  });
});

const subsets = <A>(values: ReadonlyArray<A>): ReadonlyArray<ReadonlyArray<A>> => {
  const all: Array<ReadonlyArray<A>> = [[]];
  for (const value of values) all.push(...all.map((subset) => [...subset, value]));
  return all;
};

const referenceSelection = (
  document: PortfolioDocument,
  rule: LabelRule,
): ReadonlyArray<string> => {
  const known = new Set(document.labels.map(({ id }) => id));
  const excluded = [...new Set(rule.exclude_label_ids.filter((id) => known.has(id)))];
  const excludedSet = new Set(excluded);
  const included = [...new Set(rule.include_label_ids)].filter(
    (id) => known.has(id) && !excludedSet.has(id),
  );
  const includeUnlabeled = rule.include_unlabeled && !rule.exclude_unlabeled;
  return document.work
    .filter((item) => {
      const attached = document.memberships
        .filter(({ work_id }) => work_id === item.id)
        .map(({ label_id }) => label_id);
      const unlabeled = attached.length === 0;
      if (excluded.some((id) => attached.includes(id))) return false;
      if (rule.exclude_unlabeled && unlabeled) return false;
      const positives = [
        ...included.map((id) => attached.includes(id)),
        ...(includeUnlabeled ? [unlabeled] : []),
      ];
      return (
        positives.length === 0 ||
        (rule.include_mode === "all" ? positives.every(Boolean) : positives.some(Boolean))
      );
    })
    .map(({ id }) => id)
    .sort();
};

describe("course-platform label algebra", () => {
  test("matches the independent set definition over every small universe", () => {
    const work = portfolio.work.slice(0, 3);
    const labels = portfolio.labels.slice(0, 2);
    const labelIds = labels.map(({ id }) => id);
    const groups = subsets(labelIds);
    for (let mask = 0; mask < 1 << (work.length * labels.length); mask += 1) {
      let bit = 0;
      const memberships = work.flatMap((item) =>
        labels.flatMap((label) => {
          const included = ((mask >> bit) & 1) === 1;
          bit += 1;
          return included
            ? [
                {
                  id: `membership.test.${item.id}.${label.id}`,
                  work_id: item.id,
                  label_id: label.id,
                },
              ]
            : [];
        }),
      );
      const document = { ...portfolio, work, labels, memberships };
      for (const include_label_ids of groups) {
        for (const exclude_label_ids of groups) {
          for (const include_mode of ["any", "all"] as const) {
            for (const include_unlabeled of [false, true]) {
              for (const exclude_unlabeled of [false, true]) {
                const rule: LabelRule = {
                  include_label_ids,
                  include_unlabeled,
                  include_mode,
                  exclude_label_ids,
                  exclude_unlabeled,
                };
                expect(queryWork(document, { labels: rule, where: [] }).identities).toEqual(
                  referenceSelection(document, rule),
                );
              }
            }
          }
        }
      }
    }
  });

  test("normalizes duplicates, permutation, contradictions, and unknown labels visibly", () => {
    const left = normalizeLabelRule(portfolio, {
      include_label_ids: ["label.language", "label.engineering", "label.language", "label.unknown"],
      include_unlabeled: true,
      include_mode: "all",
      exclude_label_ids: ["label.engineering"],
      exclude_unlabeled: true,
    });
    const right = normalizeLabelRule(portfolio, {
      include_label_ids: ["label.unknown", "label.engineering", "label.language"],
      include_unlabeled: true,
      include_mode: "all",
      exclude_label_ids: ["label.engineering", "label.engineering"],
      exclude_unlabeled: true,
    });
    expect(left).toEqual(right);
    expect(left.diagnostics).toEqual({
      unknown_label_ids: ["label.unknown"],
      contradictory_label_ids: ["label.engineering"],
      contradictory_unlabeled: true,
      is_unsatisfiable: false,
    });
  });
});

describe("query and presentation interpreters", () => {
  test("constructs a deterministic stable-ID multigraph index", async () => {
    const nodes = [{ id: "work.c" }, { id: "work.a" }, { id: "work.b" }];
    const edges = [
      { id: "relation.02", source_id: "work.a", target_id: "work.b" },
      { id: "relation.01", source_id: "work.a", target_id: "work.b" },
      { id: "relation.03", source_id: "work.b", target_id: "work.c" },
    ];
    const left = await Effect.runPromise(buildStableDirectedGraphIndex(nodes, edges));
    const right = await Effect.runPromise(
      buildStableDirectedGraphIndex([...nodes].reverse(), [...edges].reverse()),
    );

    expect([...left.nodeIndexById]).toEqual([
      ["work.a", 0],
      ["work.b", 1],
      ["work.c", 2],
    ]);
    expect([...left.edgeIndexById]).toEqual([
      ["relation.01", 0],
      ["relation.02", 1],
      ["relation.03", 2],
    ]);
    expect(Graph.edgeCount(left.graph)).toBe(3);
    expect([...right.nodeIndexById]).toEqual([...left.nodeIndexById]);
    expect([...right.edgeIndexById]).toEqual([...left.edgeIndexById]);
    expect(await Effect.runPromise(topologicalStableIds(left))).toEqual([
      "work.a",
      "work.b",
      "work.c",
    ]);
    expect(await Effect.runPromise(topologicalStableIds(right))).toEqual([
      "work.a",
      "work.b",
      "work.c",
    ]);
  });

  test("maps index invariant violations into typed Effect failures", async () => {
    await expect(
      Effect.runPromise(
        buildStableDirectedGraphIndex(
          [{ id: "work.a" }],
          [{ id: "relation.missing", source_id: "work.a", target_id: "work.missing" }],
        ),
      ),
    ).rejects.toMatchObject({
      _tag: "StableGraphIndexFailure",
      reason: "missing-target",
    });
  });

  test("preserves one selected identity set across list, grid, graph, DAG, and Mosaic", async () => {
    const base = view("view.overview");
    const projections = await Promise.all(
      (["list", "grid", "graph", "dag", "mosaic"] as const).map((presentation) =>
        Effect.runPromise(
          projectWork(portfolio, {
            ...base,
            id: `view.test.${presentation}`,
            presentation,
            traverse: presentation === "list" || presentation === "grid" ? [] : ["requires"],
          }),
        ),
      ),
    );
    const expected = [...projections[0]!.identities].sort();
    for (const projection of projections) {
      expect([...projection.identities].sort()).toEqual(expected);
    }
    expect(projections[4]!.presentation).toBe("mosaic");
  });

  test("evaluates typed metadata without coercion", () => {
    const base = view("view.overview").query.labels;
    expect(
      queryWork(portfolio, {
        labels: base,
        where: [{ field: "attributes.work.public-preview", operator: "equals", value: true }],
      }).identities,
    ).toEqual([
      "work.mastra.preview",
      "work.semantic.control-room-0017",
      "work.semantic.pbk-control-room",
    ]);
    expect(
      queryWork(portfolio, {
        labels: base,
        where: [{ field: "attributes.work.public-preview", operator: "equals", value: "true" }],
      }).identities,
    ).toEqual([]);
  });

  test("rejects DAG rendering for a selected cyclic relation family", async () => {
    const cyclic: PortfolioDocument = {
      ...structuredClone(portfolio),
      relations: [
        ...portfolio.relations,
        {
          id: "relation.test.contains.01",
          source_id: "work.semantic.kernel-json",
          target_id: "work.semantic.surface-language",
          kind: "contains",
          summary: "Counterexample edge one.",
        },
        {
          id: "relation.test.contains.02",
          source_id: "work.semantic.surface-language",
          target_id: "work.semantic.kernel-json",
          kind: "contains",
          summary: "Counterexample edge two.",
        },
      ],
    };
    const candidate = {
      ...view("view.roadmap"),
      id: "view.test.cyclic",
      traverse: ["contains"] as const,
    };
    await expect(Effect.runPromise(projectWork(cyclic, candidate))).rejects.toMatchObject({
      message: expect.stringMatching(/cyclic relation family/),
    });
    await expect(
      Effect.runPromise(projectWork(cyclic, { ...candidate, presentation: "graph" })),
    ).resolves.toMatchObject({ presentation: "graph" });
  });

  test("keeps the accepted Roadmap public snapshot unchanged", async () => {
    const projection = await Effect.runPromise(projectWork(portfolio, view("view.roadmap")));
    if (projection.presentation !== "dag") throw new Error("Roadmap fixture is not a DAG");
    expect({
      nodes: projection.nodes.map(({ id, depth }) => `${id}:${depth}`),
      edges: projection.edges.map(({ id }) => id),
    }).toEqual({
      nodes: [
        "work.course.decision-product:0",
        "work.flow.autonomous-studio:1",
        "work.herdr.codex-session:1",
        "work.herdr.e2e-environment:1",
        "work.herdr.fleet-resource:0",
        "work.herdr.stable-facade:0",
        "work.herdr.supervisor-wake:1",
        "work.herdr.supervisor:0",
        "work.mastra.preview:0",
        "work.pagu.environment-federation:2",
        "work.pagu.environment-runtime:1",
        "work.pagu.heterogeneous-placement:0",
        "work.qeffect.resource-tracer:0",
        "work.reef.repository-shape:0",
        "work.semantic.artifact-store:1",
        "work.semantic.control-room-0017:0",
        "work.semantic.control-room-skill-tree:2",
        "work.semantic.kernel-diagnostic-fact-custody:1",
        "work.semantic.kernel-interpreter:2",
        "work.semantic.kernel-json:0",
        "work.semantic.language-kernel:0",
        "work.semantic.normalized-core:0",
        "work.semantic.optimized-compiler:3",
        "work.semantic.pbk-control-room:1",
        "work.semantic.reachability-receipt:2",
        "work.semantic.surface-language:3",
        "work.workgraph.journeys:0",
      ],
      edges: [
        "relation.herdr.01",
        "relation.herdr.02",
        "relation.herdr.03",
        "relation.herdr.04",
        "relation.herdr.05",
        "relation.herdr.06",
        "relation.pagu.01",
        "relation.pagu.02",
        "relation.pagu.03",
        "relation.semantic.01",
        "relation.semantic.02",
        "relation.semantic.03",
        "relation.semantic.04",
        "relation.semantic.05",
        "relation.semantic.06",
        "relation.semantic.07",
        "relation.semantic.08",
        "relation.semantic.09",
        "relation.semantic.10",
        "relation.semantic.11",
        "relation.semantic.12",
        "relation.semantic.13",
        "relation.semantic.14",
        "relation.semantic.15",
        "relation.semantic.16",
        "relation.studio.01",
      ],
    });
  });

  test("is invariant to portfolio and relation permutations", async () => {
    const roadmap = view("view.roadmap");
    const baseline = await Effect.runPromise(projectWork(portfolio, roadmap));
    const permuted: PortfolioDocument = {
      ...portfolio,
      work: [...portfolio.work].reverse(),
      relations: [...portfolio.relations].reverse(),
    };
    const observed = await Effect.runPromise(projectWork(permuted, roadmap));
    expect(observed).toEqual(baseline);
  });

  test("retains parallel relation identities without inflating semantic depth", async () => {
    const roadmap = view("view.roadmap");
    const baseline = await Effect.runPromise(projectWork(portfolio, roadmap));
    const existing = portfolio.relations.find(({ kind }) => kind === "requires");
    if (baseline.presentation !== "dag" || existing === undefined) {
      throw new Error("Roadmap fixture has no requires relation");
    }
    const parallel: PortfolioDocument = {
      ...portfolio,
      relations: [
        ...portfolio.relations,
        { ...existing, id: "relation.test.parallel", summary: "Parallel authored relation." },
      ],
    };
    const observed = await Effect.runPromise(projectWork(parallel, roadmap));
    if (observed.presentation !== "dag") throw new Error("Roadmap fixture is not a DAG");

    expect(observed.edges.map(({ id }) => id)).toContain("relation.test.parallel");
    expect(observed.edges).toHaveLength(baseline.edges.length + 1);
    expect(observed.nodes.map(({ id, depth }) => [id, depth])).toEqual(
      baseline.nodes.map(({ id, depth }) => [id, depth]),
    );
  });

  test("derives the maximum 2,048-node requires chain without host recursion", async () => {
    const count = 2_048;
    const ids = Array.from(
      { length: count },
      (_, index) => `work.chain.${index.toString().padStart(4, "0")}`,
    );
    const project = portfolio.projects[0]!;
    const template = portfolio.work[0]!;
    const chain: PortfolioDocument = {
      ...portfolio,
      projects: [project],
      work: ids.map((id) => ({
        ...template,
        id,
        project_id: project.id,
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
    const projected = await Effect.runPromise(projectWork(chain, view("view.roadmap")));
    if (projected.presentation !== "dag") throw new Error("Roadmap fixture is not a DAG");
    expect(projected.nodes).toHaveLength(count);
    expect(projected.nodes.find(({ id }) => id === ids.at(-1))?.depth).toBe(count - 1);
  });
});
