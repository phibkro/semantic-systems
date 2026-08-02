export type Grade = "0" | "1" | "omega";

export const grades = Object.freeze(["0", "1", "omega"] as const);

const order: Readonly<Record<Grade, number>> = Object.freeze({
  "0": 0,
  "1": 1,
  omega: 2,
});

const addition: Readonly<Record<Grade, Readonly<Record<Grade, Grade>>>> = Object.freeze({
  "0": Object.freeze({ "0": "0", "1": "1", omega: "omega" }),
  "1": Object.freeze({ "0": "1", "1": "omega", omega: "omega" }),
  omega: Object.freeze({ "0": "omega", "1": "omega", omega: "omega" }),
});

const multiplication: Readonly<Record<Grade, Readonly<Record<Grade, Grade>>>> = Object.freeze({
  "0": Object.freeze({ "0": "0", "1": "0", omega: "0" }),
  "1": Object.freeze({ "0": "0", "1": "1", omega: "omega" }),
  omega: Object.freeze({ "0": "0", "1": "omega", omega: "omega" }),
});

export const isGrade = (value: unknown): value is Grade =>
  value === "0" || value === "1" || value === "omega";

export const gradeLessThanOrEqual = (left: Grade, right: Grade): boolean =>
  order[left] <= order[right];

export const addGrades = (left: Grade, right: Grade): Grade => addition[left][right];
export const joinGrades = (left: Grade, right: Grade): Grade =>
  left === "omega" || right === "omega" ? "omega" : left === "1" || right === "1" ? "1" : "0";

export const multiplyGrades = (left: Grade, right: Grade): Grade => multiplication[left][right];

export const atLeastOnce = (grade: Grade): Grade => (grade === "0" ? "1" : grade);

export type Usage = ReadonlyArray<Grade>;

export const zeroUsage = (length: number): Usage =>
  Object.freeze(Array.from({ length }, () => "0" as const));

export const basisUsage = (length: number, index: number): Usage =>
  Object.freeze(Array.from({ length }, (_, position) => (position === index ? "1" : "0")));

export const addUsage = (left: Usage, right: Usage): Usage => {
  if (left.length !== right.length) {
    throw new RangeError("usage vectors must have the same length");
  }
  return Object.freeze(left.map((grade, index) => addGrades(grade, right[index]!)));
};
export const joinUsage = (left: Usage, right: Usage): Usage => {
  if (left.length !== right.length) {
    throw new RangeError("usage vectors must have the same length");
  }
  return Object.freeze(left.map((grade, index) => joinGrades(grade, right[index]!)));
};

export const scaleUsage = (grade: Grade, usage: Usage): Usage =>
  Object.freeze(usage.map((entry) => multiplyGrades(grade, entry)));
