import type { ClientDatabaseError } from "@/db/errors";
import type { ClientDrizzle } from "@/db/client";

import { clients, localSettings } from "@sync-disc/db/client-schema";
import { Context, Effect, Layer, Schema } from "effect";
import { ClientId, newUuid7 } from "core";
import { eq } from "drizzle-orm";

import { clientDatabaseError } from "@/db/errors";
import { ClientDatabase } from "@/db/client";

export const CURRENT_CLIENT_SETTING_KEY = "current-client-id";

const CurrentClientSetting = Schema.Struct({ clientId: ClientId });
const decodeCurrentClientSetting = Schema.decodeUnknownSync(CurrentClientSetting);

export const ensureCurrentClient = (
  db: ClientDrizzle,
): Effect.Effect<ClientId, ClientDatabaseError> =>
  Effect.tryPromise({
    try: () =>
      db.transaction(async (tx) => {
        const existing = await tx
          .select({ value: localSettings.value })
          .from(localSettings)
          .where(eq(localSettings.key, CURRENT_CLIENT_SETTING_KEY));

        let clientId: ClientId;

        if (existing[0]) {
          clientId = decodeCurrentClientSetting(existing[0].value).clientId;
        } else {
          clientId = Schema.decodeSync(ClientId)(newUuid7());

          const inserted = await tx
            .insert(localSettings)
            .values({
              key: CURRENT_CLIENT_SETTING_KEY,
              value: { clientId },
            })
            .onConflictDoNothing()
            .returning({ key: localSettings.key });

          if (inserted.length === 0) {
            const winner = await tx
              .select({ value: localSettings.value })
              .from(localSettings)
              .where(eq(localSettings.key, CURRENT_CLIENT_SETTING_KEY));

            clientId = decodeCurrentClientSetting(winner[0]?.value).clientId;
          }
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
