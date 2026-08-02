import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { getLanguageService, type Diagnostic, type JSONSchema } from "vscode-json-languageservice";
import { TextDocument } from "vscode-languageserver-textdocument";
import {
  PROJECT_DOCUMENT_SCHEMA_PATH,
  projectDocumentJsonSchema,
} from "../src/project-model/project-json-schema.ts";
import { ENTITY_KIND_VALUES, RELATION_KIND_VALUES } from "../src/project-model/types.ts";

const ROOT = resolve(import.meta.dir, "..");
const schema = projectDocumentJsonSchema() as JSONSchema;

type JsonLanguageSettings = {
  readonly validate: { readonly enable: boolean };
  readonly schemas: ReadonlyArray<{
    readonly fileMatch: ReadonlyArray<string>;
    readonly url: string;
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
  const service = getLanguageService({
    schemaRequestService: async (uri) => {
      const source = uri.startsWith("file:")
        ? fileURLToPath(new URL(uri.replace(/#.*$/, "")))
        : resolve(ROOT, uri.replace(/^\.\//, "").replace(/#.*$/, ""));
      return Bun.file(source).text();
    },
  });
  service.configure({
    validate: settings.validate.enable,
    schemas: settings.schemas.map((association) => ({
      uri: association.url,
      fileMatch: [...association.fileMatch],
    })),
  });
  return service;
};

const diagnostics = async (value: unknown): Promise<Diagnostic[]> => {
  const service = getLanguageService({});
  const text = JSON.stringify(value, null, 2);
  const document = TextDocument.create("file:///model/work/probe.json", "json", 1, text);
  return service.doValidation(document, service.parseJSONDocument(document), {}, schema);
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
  test("projects exact kind vocabularies and feature lifecycle metadata", async () => {
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
    ).not.toEqual([]);

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
    expect(association.url).toBe(
      pathToFileURL(resolve(ROOT, PROJECT_DOCUMENT_SCHEMA_PATH)).toString(),
    );
    expect(association.fileMatch).toEqual([
      "model/architecture/**/*.json",
      "model/evidence/**/*.json",
      "model/execution/**/*.json",
      "model/runtime/**/*.json",
      "model/semantic/**/*.json",
      "model/work/**/*.json",
    ]);
    expect(pathToFileURL(resolve(ROOT, PROJECT_DOCUMENT_SCHEMA_PATH)).protocol).toBe("file:");

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
