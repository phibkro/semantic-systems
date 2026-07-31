import {
  boolType,
  intType,
  operationSignature,
  pairType,
  returnType,
  thunkType,
  unitType,
  effectRow,
} from "../../src/kernel-calculus/index.ts";

export const langBangOracleProvenance = Object.freeze({
  source: "lang-bang",
  commit: "5b8e032bcffefb23a3a153d3f5cea99050e589c1",
  license: "Apache-2.0",
  method: "independent execution of the pinned Source.eval oracle; no source copied",
  defaultRoot: "/srv/share/projects/lang-bang",
  defaultLakeExecutable: "/home/nori/.elan/toolchains/leanprover--lean4---v4.30.0/bin/lake",
  toolchain: "leanprover/lean4:v4.30.0",
  executable: ".lake/build/bin/bang",
  buildArtifactPolicy:
    "a clean detached pinned worktree may refresh only shared ignored .lake/build outputs derived from its exact source",
});

export const finiteOracleTypes = Object.freeze({
  unit: unitType(),
  bool: boolType(),
  integer: intType(),
  pair: pairType(intType(), boolType()),
  thunk: thunkType(effectRow("fresh"), returnType("1", intType())),
});

export const emptyOracleSignature = operationSignature([]);
