import { Data } from "effect";

export class LocalDatabaseError extends Data.TaggedError("LocalDatabaseError")<{
  readonly operation: string;
  readonly cause: unknown;
  readonly message: string;
}> {}

export const localDatabaseError = (operation: string, cause: unknown): LocalDatabaseError =>
  new LocalDatabaseError({
    operation,
    cause,
    message: cause instanceof Error ? cause.message : String(cause),
  });

export const describeError = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);
