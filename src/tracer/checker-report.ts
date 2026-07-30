import { canonicalJson } from "./canonical.ts";
import type { DocumentError, JsonObject, JsonValue } from "./json.ts";

export interface CheckerViolation {
  readonly code: string;
  readonly subject: string;
  readonly details: JsonObject;
}

export interface CheckerReport {
  readonly valid: boolean;
  readonly violations: ReadonlyArray<CheckerViolation>;
  readonly recomputedStatus: "selected" | "rejected" | null;
  readonly recomputedSelected: JsonObject | null;
  readonly recomputedSelectedAssumptions: ReadonlyArray<string>;
  readonly modelBindingStatus: "not_checked" | "valid" | "invalid";
}

export const checkerReportToJson = (report: CheckerReport): JsonObject => ({
  valid: report.valid,
  violations: report.violations.map((violation) => ({
    code: violation.code,
    subject: violation.subject,
    details: violation.details,
  })),
  recomputed_status: report.recomputedStatus,
  recomputed_selected: report.recomputedSelected,
  recomputed_selected_assumptions: report.recomputedSelectedAssumptions,
  model_binding_status: report.modelBindingStatus,
});

export const invalidCheckerInput = (error: DocumentError): CheckerReport => ({
  valid: false,
  violations: [
    { code: "checker_input_malformed", subject: "input", details: { error: error.message } },
  ],
  recomputedStatus: null,
  recomputedSelected: null,
  recomputedSelectedAssumptions: [],
  modelBindingStatus: "not_checked",
});

const printable = (value: unknown): JsonValue => {
  if (value === undefined) return "<missing>";
  return value as JsonValue;
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const SET_FIELDS = new Set(["reason_codes", "assumptions", "realization_assumptions"]);

export const diffSemanticJson = (
  subject: string,
  claimed: unknown,
  recomputed: unknown,
  violations: Array<CheckerViolation>,
): void => {
  if (Array.isArray(claimed) && Array.isArray(recomputed)) {
    const field = subject.slice(subject.lastIndexOf(".") + 1);
    if (SET_FIELDS.has(field)) {
      const left = [...claimed].sort();
      const right = [...recomputed].sort();
      if (
        canonicalJson(left as ReadonlyArray<JsonValue>) !==
        canonicalJson(right as ReadonlyArray<JsonValue>)
      ) {
        violations.push({
          code: "claim_field_mismatch",
          subject,
          details: { claimed: printable(claimed), recomputed: printable(recomputed) },
        });
      }
      return;
    }
    if (claimed.length !== recomputed.length) {
      violations.push({
        code: "claim_field_mismatch",
        subject,
        details: { claimed_length: claimed.length, recomputed_length: recomputed.length },
      });
    }
    for (let index = 0; index < Math.min(claimed.length, recomputed.length); index += 1) {
      diffSemanticJson(`${subject}[${index}]`, claimed[index], recomputed[index], violations);
    }
    return;
  }
  if (isObject(claimed) && isObject(recomputed)) {
    for (const key of [...new Set([...Object.keys(claimed), ...Object.keys(recomputed)])].sort()) {
      diffSemanticJson(`${subject}.${key}`, claimed[key], recomputed[key], violations);
    }
    return;
  }
  if (canonicalJson(printable(claimed)) !== canonicalJson(printable(recomputed))) {
    violations.push({
      code: "claim_field_mismatch",
      subject,
      details: { claimed: printable(claimed), recomputed: printable(recomputed) },
    });
  }
};
