/** @effect-diagnostics unstableApiUsage:off */

import { Model } from "effect/schema";
import { Schema } from "effect";

import { ClientId } from "./ids.ts";

export class Client extends Model.Class<Client>("Client")({
  id: Model.GeneratedByApp(ClientId),
  createdAt: Model.DateTimeInsert,
}) { }

export class ClientNotFound extends Schema.TaggedError<
  ClientNotFound,
  { readonly brand: unique symbol }
>()("ClientNotFound", { id: ClientId }, { httpApiStatus: 404 }) { }
