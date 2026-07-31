import {
  check,
  effectRow,
  handle,
  int,
  intType,
  operation,
  operationClause,
  operationSignature,
  resumeTerm,
  returnClause,
  returnTerm,
  unit,
  unitType,
  variable,
} from "../../src/kernel-calculus/index.ts";

export const freshSignature = operationSignature([
  {
    label: "fresh",
    operation: "allocate",
    argumentType: unitType(),
    resultType: intType(),
  },
]);

export const unhandledFresh = operation("1", "fresh", "allocate", unit());

export const handledFresh = handle(
  "fresh",
  unhandledFresh,
  returnClause(returnTerm("1", variable(0))),
  [operationClause("allocate", resumeTerm(0, int(41)))],
  effectRow(),
);

export const handledFreshCheck = () => check(freshSignature, handledFresh);
