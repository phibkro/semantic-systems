import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  canonicalKernelCheckObservationJson,
  checkKernelDocument,
  decodeKernelDocumentBytes,
  decodeKernelDocumentValue,
  kernelJsonSchema,
} from "../src/kernel-json/index.ts";

const readGolden = async (name: string): Promise<string> =>
  (await readFile(new URL(`../examples/kernel-json/${name}`, import.meta.url))).toString("utf8");

test("genuine Node reproduces the frozen golden kernel-json observations", async () => {
  const cases: ReadonlyArray<readonly [string, string]> = [
    ["pure-program.kernel.json", "pure-program.accepted.kernel-check.json"],
    ["handled-program.kernel.json", "handled-program.accepted.kernel-check.json"],
    ["rejected-double-resume.kernel.json", "rejected-double-resume.rejected.kernel-check.json"],
  ];
  for (const [documentFile, observationFile] of cases) {
    const documentJson = JSON.parse(await readGolden(documentFile)) as unknown;
    const decoded = decodeKernelDocumentValue(documentJson);
    assert.equal(decoded.status, "decoded");
    if (decoded.status !== "decoded") continue;
    const observation = checkKernelDocument(decoded.value);
    const expectedJson = JSON.parse(await readGolden(observationFile)) as unknown;
    assert.equal(
      canonicalKernelCheckObservationJson(observation),
      canonicalKernelCheckObservationJson(expectedJson as never),
    );
  }

  const bytes = new TextEncoder().encode(await readGolden("pure-program.kernel.json"));
  const decodedBytes = decodeKernelDocumentBytes(bytes);
  assert.equal(decodedBytes.status, "decoded");

  const fileSchema = JSON.parse(
    await readFile(
      new URL("../spec/kernel-json/kernel-json-v1.schema.json", import.meta.url),
      "utf8",
    ),
  ) as unknown;
  assert.equal(JSON.stringify(kernelJsonSchema()), JSON.stringify(fileSchema));
});
