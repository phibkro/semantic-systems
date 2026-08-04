import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { getLanguageService, type Diagnostic, type JSONSchema } from "vscode-json-languageservice";
import { TextDocument } from "vscode-languageserver-textdocument";
import { PROJECT_DOCUMENT_SCHEMA_PATH } from "../src/project-model/project-json-schema.ts";
import {
  ENTITY_KIND_VALUES,
  RELATION_KIND_VALUES,
  type ProjectGraph,
} from "../src/project-model/types.ts";
import { validateProject } from "../src/project-model/validate.ts";

const ROOT = resolve(import.meta.dir, "..");
const schema = JSON.parse(
  await Bun.file(resolve(ROOT, PROJECT_DOCUMENT_SCHEMA_PATH)).text(),
) as JSONSchema;

type JsonLanguageSettings = {
  readonly validate: { readonly enable: boolean };
  readonly schemas: ReadonlyArray<{
    readonly fileMatch: ReadonlyArray<string>;
    readonly schema: JSONSchema;
  }>;
};

const projectJsonSettings = async (): Promise<JsonLanguageSettings> => {
  const config = JSON.parse(await Bun.file(resolve(ROOT, ".omp/lsp.json")).text()) as {
    readonly servers: Readonly<
      Record<string, { readonly settings?: { readonly json?: JsonLanguageSettings } }>
    >;
  };
  const settings = config.servers["vscode-json-language-server"]?.settings?.json;
  if (settings === undefined) throw new Error("project JSON language settings are missing");
  return settings;
};

const configuredLanguageService = async () => {
  const settings = await projectJsonSettings();
  const service = getLanguageService({});
  service.configure({
    validate: settings.validate.enable,
    schemas: settings.schemas.map((association, index) => ({
      uri: `vscode://schemas/custom/${index}`,
      fileMatch: [...association.fileMatch],
      schema: association.schema,
    })),
  });
  return service;
};

const diagnostics = async (value: unknown): Promise<Diagnostic[]> => {
  const service = getLanguageService({});
  const text = JSON.stringify(value, null, 2);
  const document = TextDocument.create("file:///model/work/probe.json", "json", 1, text);
  return service.doValidation(
    document,
    service.parseJSONDocument(document),
    {},
    structuredClone(schema),
  );
};

const validDocument = {
  entities: [
    {
      id: "work.schema-probe",
      kind: "work_item",
      name: "Schema probe",
      summary: "Representative feature record.",
      status: "planned",
      tags: ["work"],
      attributes: {
        feature_id: "0056-project-json-language-tooling",
        feature_loop: "managed",
        phase: "design",
      },
    },
  ],
  relations: [],
};

describe("project JSON language tooling 0056", () => {
  test("projects exact kind vocabularies without treating feature lifecycle attributes as authority", async () => {
    expect(await diagnostics(validDocument)).toEqual([]);
    expect(await diagnostics({ ...validDocument, entities: "not-an-array" })).not.toEqual([]);
    expect(
      await diagnostics({
        ...validDocument,
        entities: [{ ...validDocument.entities[0], kind: "invented_kind" }],
      }),
    ).not.toEqual([]);
    expect(
      await diagnostics({
        ...validDocument,
        entities: [
          {
            ...validDocument.entities[0],
            attributes: { ...validDocument.entities[0].attributes, feature_loop: "sometimes" },
          },
        ],
      }),
    ).toEqual([]);
    expect(
      await diagnostics({
        ...validDocument,
        entities: [
          {
            ...validDocument.entities[0],
            attributes: { feature_loop: "sometimes" },
          },
        ],
      }),
    ).toEqual([]);

    const serialized = JSON.stringify(schema);
    for (const kind of ENTITY_KIND_VALUES) expect(serialized).toContain(`"${kind}"`);
    for (const kind of RELATION_KIND_VALUES) expect(serialized).toContain(`"${kind}"`);
  });

  test("accepts every canonical project-model source document", async () => {
    const glob = new Bun.Glob("model/**/*.json");
    for await (const source of glob.scan({ cwd: ROOT, onlyFiles: true })) {
      const value = JSON.parse(await Bun.file(resolve(ROOT, source)).text()) as unknown;
      expect(await diagnostics(value), source).toEqual([]);
    }
  });

  test("keeps referential integrity in semantic validation", async () => {
    const sourceId = "claim.schema-probe";
    const targetId = "claim.does-not-exist";
    const source = "model/work/probe.json";
    const document = {
      entities: [{ id: sourceId, kind: "claim", name: "Schema probe" }],
      relations: [{ source: sourceId, target: targetId, kind: "supports" }],
    };
    expect(await diagnostics(document)).toEqual([]);

    const project: ProjectGraph = {
      root: ROOT,
      entities: new Map([
        [
          sourceId,
          {
            id: sourceId,
            kind: "claim",
            name: "Schema probe",
            summary: "",
            status: null,
            tags: [],
            attributes: {},
            source,
          },
        ],
      ]),
      relations: [
        {
          sourceId,
          targetId,
          kind: "supports",
          summary: "",
          attributes: {},
          source,
        },
      ],
    };
    expect(validateProject(project).map((issue) => issue.code)).toContain("relation.target");
  });

  test("offers standard enum completion without a custom language server", async () => {
    const text = '{"entities":[{"id":"work.probe","kind":"","name":"Probe"}],"relations":[]}';
    const document = TextDocument.create(
      pathToFileURL(resolve(ROOT, "model/work/probe.json")).toString(),
      "json",
      1,
      text,
    );
    const offset = text.indexOf('"","name"') + 1;
    const unconfigured = getLanguageService({});
    const result = await unconfigured.doComplete(
      document,
      document.positionAt(offset),
      unconfigured.parseJSONDocument(document),
    );
    const configuredService = await configuredLanguageService();
    const configured = await configuredService.doComplete(
      document,
      document.positionAt(offset),
      configuredService.parseJSONDocument(document),
    );
    expect(result?.items ?? []).toEqual([]);
    expect(configured?.items.map((item) => item.label)).toContain('"work_item"');
  });

  test("associates only canonical model inputs with the generated schema", async () => {
    const settings = await projectJsonSettings();
    const association = settings.schemas[0]!;
    expect(association.schema).toEqual(schema);
    expect(association.fileMatch).toEqual(["model/**/*.json"]);

    const service = await configuredLanguageService();
    const text = JSON.stringify({ ...validDocument, entities: "not-an-array" });
    const document = TextDocument.create(
      pathToFileURL(resolve(ROOT, "model/work/probe.json")).toString(),
      "json",
      1,
      text,
    );
    expect(await service.doValidation(document, service.parseJSONDocument(document))).not.toEqual(
      [],
    );
  });
});
