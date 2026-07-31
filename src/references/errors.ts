import { Data } from "effect";

export class CatalogError extends Data.TaggedError("CatalogError")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

export class LockFileError extends Data.TaggedError("LockFileError")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

export class AcquisitionError extends Data.TaggedError("AcquisitionError")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

export class NotLockableError extends Data.TaggedError("NotLockableError")<{
  readonly message: string;
}> {}

export class CuratorLockedError extends Data.TaggedError("CuratorLockedError")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}
