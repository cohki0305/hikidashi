import { createFactory } from "hono/factory";
import * as members from "@/server/api/protected/members/handlers/members";
import type { MembersEnv } from "./context";

const factory = createFactory<MembersEnv>();

export const memberRoutes = factory
  .createApp()
  .get("/members", ...members.index)
  .delete("/members/:email", ...members.destroy);
