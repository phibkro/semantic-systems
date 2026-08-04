import { beforeAll, describe, expect, test } from "bun:test";
import { BunFileSystem, BunPath } from "@effect/platform-bun";
import { Effect, type FileSystem, type Path } from "effect";
import { readdir, stat } from "node:fs/promises";
import { resolve } from "node:path";
import {
  ENFORCEMENT_REGISTER,
  VALIDATION_ISSUE_CODE_REGISTRY,
  VALIDATION_ISSUE_CODES,
} from "../src/project-model/enforcement-register.ts";
import { loadProject } from "../src/project-model/loader.ts";
import { type ValidationIssueCode, validateProject } from "../src/project-model/validate.ts";
import {
  byKind,
  incoming,
  type Attributes,
  type Entity,
  type ProjectGraph,
  type Relation,
} from "../src/project-model/types.ts";

const ROOT = resolve(import.meta.dir, "..");

type Fixture = {
  readonly code: ValidationIssueCode;
  readonly project: ProjectGraph;
};

const runBun = <A, E>(effect: Effect.Effect<A, E, FileSystem.FileSystem | Path.Path>): Promise<A> =>
  Effect.runPromise(effect.pipe(Effect.provide([BunFileSystem.layer, BunPath.layer])));

const replaceEntity = (
  project: ProjectGraph,
  predicate: (entity: Entity) => boolean,
  update: (entity: Entity) => Entity,
): ProjectGraph => {
  const entities = new Map(project.entities);
  const source = [...entities.values()].find(predicate);
  if (source === undefined) throw new Error("RX4 fixture entity was not found");
  entities.set(source.id, update(source));
  return { ...project, entities };
};

const replaceEntityId = (project: ProjectGraph): ProjectGraph => {
  const entities = new Map(project.entities);
  const source = [...entities.values()][0];
  if (source === undefined) throw new Error("RX4 entity-id fixture has no entity");
  entities.delete(source.id);
  entities.set("rx4 invalid id", { ...source, id: "rx4 invalid id" });
  return { ...project, entities };
};

const withAttributes = (entity: Entity, attributes: Attributes): Entity => ({
  ...entity,
  attributes,
});

const replaceRelation = (
  project: ProjectGraph,
  update: (relation: Relation) => Relation,
): ProjectGraph => {
  const first = project.relations[0];
  if (first === undefined) throw new Error("RX4 relation fixture has no relation");
  return {
    ...project,
    relations: [update(first), ...project.relations.slice(1)],
  };
};

const fixtureRelation = (sourceId: string, targetId: string, kind: string): Relation => ({
  sourceId,
  targetId,
  kind,
  summary: "RX4 validation fixture",
  attributes: {},
  source: "tests/enforcement-register.test.ts",
});

const validationFixtures = (canonical: ProjectGraph): ReadonlyArray<Fixture> => {
  const work = byKind(canonical, "work_item")[0];
  const evidence = byKind(canonical, "evidence")[0];
  const workItems = byKind(canonical, "work_item");
  const entities = [...canonical.entities.values()];
  if (work === undefined || evidence === undefined || workItems.length < 2 || entities.length < 2) {
    throw new Error("canonical project fixture lacks RX4 validation fixture inputs");
  }

  const containment = {
    ...canonical,
    relations: [
      ...canonical.relations,
      fixtureRelation(entities[0]!.id, entities[1]!.id, "contains"),
      fixtureRelation(entities[1]!.id, entities[0]!.id, "contains"),
    ],
  };
  const workCycle = {
    ...canonical,
    relations: [
      ...canonical.relations,
      fixtureRelation(workItems[0]!.id, workItems[1]!.id, "blocks"),
      fixtureRelation(workItems[1]!.id, workItems[0]!.id, "blocks"),
    ],
  };

  const unsupportedClaim = byKind(canonical, "claim").find(
    (claim) => incoming(canonical, claim.id, new Set(["supports", "discharges"])).length === 0,
  );
  const claimFixture =
    unsupportedClaim === undefined
      ? {
          ...canonical,
          entities: new Map([
            ...canonical.entities,
            [
              "rx4.unsupported-claim",
              {
                id: "rx4.unsupported-claim",
                kind: "claim",
                name: "RX4 unsupported claim",
                summary: "",
                status: null,
                tags: [],
                attributes: {},
                source: "tests/enforcement-register.test.ts",
              } satisfies Entity,
            ],
          ]),
        }
      : canonical;

  return [
    {
      code: "entity.kind",
      project: replaceEntity(
        canonical,
        () => true,
        (entity) => ({ ...entity, kind: "rx4.invalid" }),
      ),
    },
    { code: "entity.id", project: replaceEntityId(canonical) },
    {
      code: "evidence.type",
      project: replaceEntity(
        canonical,
        (entity) => entity.id === evidence.id,
        (entity) =>
          withAttributes(entity, { ...entity.attributes, evidence_type: "rx4-invalid-evidence" }),
      ),
    },
    {
      code: "relation.kind",
      project: replaceRelation(canonical, (relation) => ({ ...relation, kind: "rx4.invalid" })),
    },
    {
      code: "relation.source",
      project: replaceRelation(canonical, (relation) => ({
        ...relation,
        sourceId: "rx4.missing-source",
      })),
    },
    {
      code: "relation.target",
      project: replaceRelation(canonical, (relation) => ({
        ...relation,
        targetId: "rx4.missing-target",
      })),
    },
    { code: "containment.cycle", project: containment },
    { code: "work.cycle", project: workCycle },
    { code: "claim.unsupported", project: claimFixture },
  ];
};

describe("RX4 enforcement register", () => {
  let canonical: ProjectGraph;

  beforeAll(async () => {
    canonical = await runBun(loadProject(ROOT));
  });

  test("contains typed entries for active claims and gate commands", () => {
    expect(ENFORCEMENT_REGISTER.length).toBeGreaterThan(0);
    expect(new Set(ENFORCEMENT_REGISTER.map((entry) => entry.id)).size).toBe(
      ENFORCEMENT_REGISTER.length,
    );
    for (const entry of ENFORCEMENT_REGISTER) {
      expect(entry.source.length).toBeGreaterThan(0);
      expect(entry.environment.length).toBeGreaterThan(0);
      expect(entry.claim.length).toBeGreaterThan(0);
      if (entry.classification === "review-only") {
        expect(entry.artifact).toBeNull();
        expect(entry.reviewReason.length).toBeGreaterThan(0);
      } else {
        expect(entry.artifact.length).toBeGreaterThan(0);
      }
    }
  });

  test("resolves every registered source and artifact locator", async () => {
    const locators = ENFORCEMENT_REGISTER.flatMap((entry) =>
      entry.artifact === null
        ? entry.source.split("; ")
        : entry.source.split("; ").concat(entry.artifact.split("; ")),
    );
    const packageJson = (await Bun.file(resolve(ROOT, "package.json")).json()) as {
      readonly scripts: Readonly<Record<string, string>>;
    };

    for (const locator of locators) {
      const [path, selector] = locator.split("#", 2);
      const metadata = await stat(resolve(ROOT, path!));
      expect(metadata.isFile() || metadata.isDirectory()).toBe(true);
      if (selector?.startsWith("scripts.") === true) {
        expect(path).toBe("package.json");
        expect(Object.hasOwn(packageJson.scripts, selector.slice("scripts.".length))).toBe(true);
        continue;
      }
      if (selector === undefined || !/^\d/u.test(selector)) continue;

      expect(metadata.isFile()).toBe(true);
      const lines = (await Bun.file(resolve(ROOT, path!)).text()).split(/\r?\n/u);
      for (const extent of selector.split(",")) {
        const [startText, endText = startText] = extent.split("-", 2);
        const start = Number.parseInt(startText!, 10);
        const end = Number.parseInt(endText!, 10);
        expect(start).toBeGreaterThan(0);
        expect(end).toBeGreaterThanOrEqual(start);
        expect(end).toBeLessThanOrEqual(lines.length);
        expect(
          lines
            .slice(start - 1, end)
            .join("\n")
            .trim().length,
        ).toBeGreaterThan(0);
      }
    }
  });

  test("covers every current package and check-script command surface", async () => {
    const packageJson = (await Bun.file(resolve(ROOT, "package.json")).json()) as {
      readonly scripts: Readonly<Record<string, string>>;
    };
    const locators = ENFORCEMENT_REGISTER.flatMap((entry) =>
      entry.artifact === null
        ? entry.source.split("; ")
        : entry.source.split("; ").concat(entry.artifact.split("; ")),
    );
    for (const script of Object.keys(packageJson.scripts)) {
      expect(locators).toContain(`package.json#scripts.${script}`);
    }

    const checkScripts = (await readdir(resolve(ROOT, "scripts")))
      .filter((name) => /^check.*\.ts$/u.test(name))
      .map((name) => `scripts/${name}`);
    for (const script of checkScripts) {
      expect(
        locators.some((locator) => locator === script || locator.startsWith(`${script}#`)),
      ).toBe(true);
    }
  });

  test("keeps the finite registry metadata aligned with its exported code set", () => {
    expect(VALIDATION_ISSUE_CODE_REGISTRY.map((entry) => entry.code)).toEqual([
      ...VALIDATION_ISSUE_CODES,
    ]);
    expect(new Set(VALIDATION_ISSUE_CODES).size).toBe(VALIDATION_ISSUE_CODES.length);
  });

  test("proves every emitted validation code is registered", () => {
    const projects = [
      canonical,
      ...validationFixtures(canonical).map((fixture) => fixture.project),
    ];
    for (const project of projects) {
      for (const issue of validateProject(project)) {
        expect(VALIDATION_ISSUE_CODES).toContain(issue.code);
      }
    }
  });

  test("proves every registered validation code has a producing real fixture", () => {
    const fixtures = validationFixtures(canonical);
    const expectedCodes = new Set(fixtures.map((fixture) => fixture.code));
    expect(expectedCodes.size).toBe(VALIDATION_ISSUE_CODES.length);
    for (const entry of VALIDATION_ISSUE_CODE_REGISTRY) {
      const fixture = fixtures.find((candidate) => candidate.code === entry.code);
      expect(fixture).toBeDefined();
      const issue = validateProject(fixture!.project).find(
        (candidate) => candidate.code === entry.code,
      );
      expect(issue?.severity).toBe(entry.severity);
    }
  });
});
