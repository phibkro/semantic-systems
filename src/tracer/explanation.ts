import type { JsonObject } from "./json.ts";

export interface ExplanationNode {
  readonly rule: string;
  readonly outcome: string;
  readonly subject: string;
  readonly details: JsonObject;
  readonly children: ReadonlyArray<ExplanationNode>;
}

export const explanationToJson = (node: ExplanationNode): JsonObject => ({
  rule: node.rule,
  outcome: node.outcome,
  subject: node.subject,
  details: node.details,
  children: node.children.map(explanationToJson),
});
