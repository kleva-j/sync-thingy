/** @effect-diagnostics unstableApiUsage:off */

import { Context, Schema } from "effect";
import { Model } from "effect/schema";

export const ClientId = Schema.Finite.pipe(Schema.brand("ClientId"));
export type ClientId = typeof ClientId.Type;

export class Client extends Model.Class<Client>("Client")({
  id: Model.GeneratedByDb(ClientId),
  createdAt: Model.DateTimeInsert,
}) {}

export class CurrentClient extends Context.Service<CurrentClient, Client>()(
  "Domain/Client/CurrentClient",
) {}

export class ClientNotFound extends Schema.TaggedError<
  ClientNotFound,
  { readonly brand: unique symbol }
>()("ClientNotFound", { id: ClientId }, { httpApiStatus: 404 }) {}
