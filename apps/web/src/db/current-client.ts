import type { ClientDrizzle } from "@sync-disc/db/client-db";
import type { ClientDatabaseError } from "@/db/errors";

import { clients, localSettings } from "@sync-disc/db/client-schema";
import { Context, Effect, Layer, Schema } from "effect";
import { ClientId, newUuid7 } from "core";
import { eq, sql } from "drizzle-orm";

import { clientDatabaseError } from "@/db/errors";
import { ClientDatabase } from "@/db/client";

export const SETTING_KEY = "current-client-id";

const CurrentClientSetting = Schema.Struct({ clientId: ClientId });
const decodeSetting = Schema.decodeUnknownSync(CurrentClientSetting);

export const ensureCurrentClient = (
  db: ClientDrizzle,
): Effect.Effect<ClientId, ClientDatabaseError> =>
  Effect.tryPromise({
    try: () =>
      db.transaction(async (tx) => {
        const [existing] = await tx
          .select({ value: localSettings.value })
          .from(localSettings)
          .where(eq(localSettings.key, SETTING_KEY));

        if (existing) {
          const { clientId } = decodeSetting(existing.value);
          await tx.insert(clients).values({ id: clientId }).onConflictDoNothing();
          return clientId;
        }

        const clientId = Schema.decodeSync(ClientId)(newUuid7());

        const [inserted] = await tx
          .insert(localSettings)
          .values({ key: SETTING_KEY, value: { clientId } })
          .onConflictDoUpdate({
            target: localSettings.key,
            set: { value: sql`${localSettings.value}` },
          })
          .returning({ value: localSettings.value });

        if (!inserted) {
          throw new Error("current client setting was not returned after insert");
        }
        await tx.insert(clients).values({ id: clientId }).onConflictDoNothing();
        return clientId;
      }),
    catch: (cause) => clientDatabaseError("ensure current client", cause),
  });

export class CurrentClient extends Context.Service<
  CurrentClient,
  { readonly id: ClientId }
>()("@sync-disc/web/CurrentClient") { }

export const CurrentClientLive: Layer.Layer<CurrentClient, ClientDatabaseError, ClientDatabase> =
  Layer.effect(
    CurrentClient,
    Effect.gen(function* () {
      const { db } = yield* ClientDatabase;
      return { id: yield* ensureCurrentClient(db) };
    }),
  );
