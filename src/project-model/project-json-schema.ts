import { Schema } from "effect";
import { stringifyCanonicalJson } from "../references/canonical-json.ts";
import { MODEL_DOCUMENT_GLOB, ProjectDocumentInputSchema } from "./loader.ts";
import type { JsonValue } from "./types.ts";
import { FeatureMetadataSchema } from "./work-lifecycle.ts";

export const PROJECT_DOCUMENT_SCHEMA_PATH = "generated/schema/project-document.schema.json";
export const PROJECT_JSON_LANGUAGE_SERVER_CONFIG_PATH = ".omp/lsp.json";

const SchemaProjectionSource = Schema.Struct({
  document: ProjectDocumentInputSchema,
  featureMetadata: FeatureMetadataSchema,
});

type MutableJsonObject = Record<string, unknown>;

const cloneObject = (value: unknown): MutableJsonObject =>
  structuredClone(value) as MutableJsonObject;

const buildProjectDocumentJsonSchema = (): JsonValue => {
  const document = Schema.toJsonSchemaDocument(SchemaProjectionSource, {
    generateDescriptions: true,
  });
  const sourceSchema = document.schema as MutableJsonObject;
  const sourceProperties = sourceSchema.properties as MutableJsonObject;
  const root = cloneObject(sourceProperties.document);
  const definitions = cloneObject(document.definitions);
  const entity = definitions.ProjectEntityInput as MutableJsonObject;
  const featureMetadata = definitions.FeatureMetadata as MutableJsonObject;

  // Lifecycle owns only these named keys. Other attribute vocabularies stay open
  // for their domain validators rather than being rejected by editor tooling.
  featureMetadata.additionalProperties = true;
  entity.allOf = [
    Object.fromEntries([
      [
        "if",
        {
          required: ["kind", "attributes"],
          properties: {
            kind: { const: "work_item" },
            attributes: {
              anyOf: [{ required: ["feature_id"] }, { required: ["feature_loop"] }],
            },
          },
        },
      ],
      [
        // oxlint-disable-next-line unicorn/no-thenable -- `then` is required by JSON Schema Draft 2020-12.
        "then",
        {
          properties: {
            attributes: { $ref: "#/$defs/FeatureMetadata" },
          },
        },
      ],
    ]),
  ];

  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: "Semantic Systems project document",
    description:
      "Generated structural projection. Run semproj validate for cross-document semantics.",
    ...root,
    $defs: definitions as JsonValue,
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
