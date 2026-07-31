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
  executable: ".lake/build/bin/bang",
  cleanSourcePaths: Object.freeze(["Main.lean", "Bang", "lakefile.toml", "lean-toolchain"]),
});

export const finiteOracleTypes = Object.freeze({
  unit: unitType(),
  bool: boolType(),
  integer: intType(),
  pair: pairType(intType(), boolType()),
  thunk: thunkType(effectRow("fresh"), returnType("1", intType())),
});

export const emptyOracleSignature = operationSignature([]);
