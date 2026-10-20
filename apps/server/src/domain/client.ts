/** @effect-diagnostics unstableApiUsage:off */

import { Context } from "effect";
import { Client } from "core";

export { Client, ClientId, ClientNotFound } from "core";

export class CurrentClient extends Context.Service<CurrentClient, Client>()(
  "Domain/Client/CurrentClient",
) {}
