export type EffectRow = ReadonlyArray<string>;

const normalizedLabels = (labels: Iterable<string>): ReadonlyArray<string> =>
  [...new Set(labels)].sort((left, right) => left.localeCompare(right));

export const effectRow = (...labels: ReadonlyArray<string>): EffectRow =>
  Object.freeze(normalizedLabels(labels));

export const emptyEffectRow = effectRow();

export const unionEffectRows = (...rows: ReadonlyArray<EffectRow>): EffectRow =>
  Object.freeze(normalizedLabels(rows.flatMap((row) => row)));

export const removeEffectLabel = (row: EffectRow, label: string): EffectRow =>
  Object.freeze(row.filter((entry) => entry !== label));

export const effectRowHas = (row: EffectRow, label: string): boolean => row.includes(label);

export const effectRowIsSubset = (left: EffectRow, right: EffectRow): boolean =>
  left.every((label) => right.includes(label));

export const effectRowsEqual = (left: EffectRow, right: EffectRow): boolean =>
  left.length === right.length && left.every((label, index) => label === right[index]);
