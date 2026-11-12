import { createFactory } from "hono/factory";
import { type MemberServicePort, provideMemberService } from "./context";
import { inviteRoutes } from "./routes";

const factory = createFactory();

/** 招待の入口。Service が無ければ 404 で塞ぐ（fail closed）。 */
export function createInviteRoutes(service?: MemberServicePort) {
  return factory.createApp().use("*", provideMemberService(service)).route("/", inviteRoutes);
}

export type { MemberServicePort } from "./context";
