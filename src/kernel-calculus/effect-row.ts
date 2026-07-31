export type EffectRow = ReadonlyArray<string>;

const compareCodePoints = (left: string, right: string): number => {
  const leftPoints = Array.from(left, (value) => value.codePointAt(0)!);
  const rightPoints = Array.from(right, (value) => value.codePointAt(0)!);
  const length = Math.min(leftPoints.length, rightPoints.length);
  for (let index = 0; index < length; index += 1) {
    const order = leftPoints[index]! - rightPoints[index]!;
    if (order !== 0) return order;
  }
  return leftPoints.length - rightPoints.length;
};

const normalizedLabels = (labels: Iterable<string>): ReadonlyArray<string> =>
  [...new Set(labels)].sort(compareCodePoints);

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
