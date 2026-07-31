import { kernelJsonSchemaData } from "./schema-data.ts";

const deepFreeze = <Value>(value: Value): Value => {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
};

const frozenSchema = deepFreeze(
  JSON.parse(JSON.stringify(kernelJsonSchemaData)) as Readonly<Record<string, unknown>>,
);

/**
 * Returns the frozen `semantic.kernel-json` / `semantic.kernel-check` JSON
 * Schema Draft 2020-12 artifact as inert data. The module has no filesystem
 * authority; the artifact is embedded verbatim and a test proves it
 * byte-equal to the checked-in `spec/kernel-json/kernel-json-v1.schema.json`.
 */
export const kernelJsonSchema = (): Readonly<Record<string, unknown>> => frozenSchema;
