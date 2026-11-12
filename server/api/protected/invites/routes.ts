import { createFactory } from "hono/factory";
import * as invites from "@/server/api/protected/invites/handlers/invites";
import * as redemptions from "@/server/api/protected/invites/handlers/redemptions";
import type { InvitesEnv } from "./context";

const factory = createFactory<InvitesEnv>();

export const inviteRoutes = factory
  .createApp()
  .get("/", ...invites.index)
  .post("/", ...invites.create)
  .delete("/:id", ...invites.destroy)
  .post("/redemptions", ...redemptions.create);
