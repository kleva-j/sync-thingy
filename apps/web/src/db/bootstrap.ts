import { Effect } from "effect";

import { ClientDatabase } from "./client";
import { runMigrations } from "./migrations";

export const bootstrapClientDatabase = Effect.gen(function* () {
  const { pg } = yield* ClientDatabase;
  yield* runMigrations(pg);
});
