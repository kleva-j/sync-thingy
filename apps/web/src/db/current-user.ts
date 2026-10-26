import type { UserId } from "core";

import { Context, Layer } from "effect";

export class CurrentUser extends Context.Service<
  CurrentUser,
  { readonly id: UserId }
>()("@sync-disc/web/CurrentUser") {}

export const CurrentUserLive = (id: UserId): Layer.Layer<CurrentUser> =>
  Layer.succeed(CurrentUser, CurrentUser.of({ id }));
