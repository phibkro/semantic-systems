import { Schema } from "effect";
import { stringifyCanonicalJson } from "../references/canonical-json.ts";
import { MODEL_DOCUMENT_GLOB, ProjectDocumentInputSchema } from "./loader.ts";
import type { JsonValue } from "./types.ts";

export const PROJECT_DOCUMENT_SCHEMA_PATH = "generated/schema/project-document.schema.json";
export const PROJECT_JSON_LANGUAGE_SERVER_CONFIG_PATH = ".omp/lsp.json";

type MutableJsonObject = Record<string, unknown>;

const cloneObject = (value: unknown): MutableJsonObject =>
  structuredClone(value) as MutableJsonObject;

const buildProjectDocumentJsonSchema = (): JsonValue => {
  const document = Schema.toJsonSchemaDocument(ProjectDocumentInputSchema, {
    generateDescriptions: true,
  });
  const root = cloneObject(document.schema);
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: "Semantic Systems project document",
    description:
      "Generated structural projection. Run semproj validate for cross-document semantics.",
    ...root,
    $defs: cloneObject(document.definitions) as JsonValue,
  };
};

const ProjectDocumentJsonSchema = buildProjectDocumentJsonSchema();

export const projectDocumentJsonSchema = (): JsonValue =>
  structuredClone(ProjectDocumentJsonSchema);

export const projectDocumentJsonSchemaText = (): string =>
  `${stringifyCanonicalJson(projectDocumentJsonSchema(), 2)}\n`;

export const projectJsonLanguageServerConfig = (): JsonValue => ({
  servers: {
    "vscode-json-language-server": {
      settings: {
        json: {
          validate: { enable: true },
          schemas: [
            {
              fileMatch: [`model/${MODEL_DOCUMENT_GLOB}`],
              schema: projectDocumentJsonSchema(),
            },
          ],
        },
      },
    },
  },
});

export const projectJsonLanguageServerConfigText = (): string =>
  `${stringifyCanonicalJson(projectJsonLanguageServerConfig(), 2)}\n`;
