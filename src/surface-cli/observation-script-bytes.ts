/** Strict bounded JSON byte boundary for affine observation scripts. */
import { Exit, Schema } from "effect";
import {
  decodeExternalObservationScript,
  type EffectRunDiagnostic,
  type ExternalObservationScript,
  type KernelEffectRunObservation,
} from "../kernel-interpreter/index.ts";
import { scanJson } from "../normalized-core/canonical.ts";

export const maximumObservationScriptBytes = 1_048_576;
export const maximumObservationScriptJsonDepth = 128;
export const maximumObservationScriptJsonNodes = 65_536;

export type ObservationScriptBytesDecode =
  | { readonly status: "decoded"; readonly value: ExternalObservationScript }
  | { readonly status: "rejected"; readonly observation: KernelEffectRunObservation };

const decoder = new TextDecoder("utf-8", { fatal: true });

const rejected = (diagnostic: EffectRunDiagnostic): ObservationScriptBytesDecode => ({
  status: "rejected",
  observation: Object.freeze({
    format: "semantic.kernel-effect-run",
    version: 1,
    kernel: "semantic.kernel-calculus/0018/v1",
    observation: Object.freeze({
      tag: "script-rejected",
      diagnostics: Object.freeze([Object.freeze(diagnostic)]),
    }),
  }),
});

export const decodeObservationScriptBytes = (bytes: Uint8Array): ObservationScriptBytesDecode => {
  if (bytes.byteLength > maximumObservationScriptBytes) {
    return rejected({
      code: "external-observation-script.byte.bytes-exceeded",
      path: "$",
      message: `observation script exceeds the ${maximumObservationScriptBytes} byte limit`,
    });
  }

  let text: string;
  try {
    text = decoder.decode(bytes);
  } catch {
    return rejected({
      code: "external-observation-script.byte.invalid-utf8",
      path: "$",
      message: "observation script must be valid UTF-8",
    });
  }

  const issue = scanJson(
    text,
    maximumObservationScriptJsonDepth,
    maximumObservationScriptJsonNodes,
  );
  if (issue !== undefined) {
    return rejected({
      code: `external-observation-script.${issue.code}`,
      path: "$",
      message: issue.message,
    });
  }

  const parsed = Schema.decodeUnknownExit(Schema.UnknownFromJsonString)(text);
  if (Exit.isFailure(parsed)) {
    return rejected({
      code: "external-observation-script.byte.json-grammar",
      path: "$",
      message: "invalid JSON value",
    });
  }
  return decodeExternalObservationScript(parsed.value);
};
