import { Data } from "effect";

export class ClientDatabaseError extends Data.TaggedError("ClientDatabaseError")<{
  readonly operation: string;
  readonly cause: unknown;
  readonly message: string;
}> {}

export const clientDatabaseError = (operation: string, cause: unknown): ClientDatabaseError =>
  new ClientDatabaseError({
    operation,
    cause,
    message: cause instanceof Error ? cause.message : String(cause),
  });

export class RepositoryError extends Data.TaggedError("RepositoryError")<{
  readonly operation: string;
  readonly cause: unknown;
  readonly message: string;
}> {}

export const repositoryError = (operation: string, cause: unknown): RepositoryError =>
  new RepositoryError({
    operation,
    cause,
    message: cause instanceof Error ? cause.message : String(cause),
  });

export const describeError = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);
