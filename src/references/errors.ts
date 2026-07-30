import { Data } from "effect";

export class CatalogError extends Data.TaggedError("CatalogError")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

export class LockFileError extends Data.TaggedError("LockFileError")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}
