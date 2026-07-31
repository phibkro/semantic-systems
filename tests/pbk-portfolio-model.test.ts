import { BunFileSystem, BunPath } from "@effect/platform-bun";
import { Effect } from "effect";
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
    expect(portfolio.projects).toHaveLength(8);
    expect(portfolio.work).toHaveLength(14);
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
          id: "priority.pbk-control-room.02",
          work_id: "work.semantic.pbk-control-room",
          rank: 2,
          asserted_at: "2026-07-31T15:30:00Z",
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
});
