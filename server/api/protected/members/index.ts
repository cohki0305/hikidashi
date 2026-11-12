import { createFactory } from "hono/factory";
import { type MemberServicePort, provideMemberService } from "./context";
import { memberRoutes } from "./routes";

const factory = createFactory();

/** メンバーの入口。Service が無ければ 404 で塞ぐ（fail closed）。 */
export function createMemberRoutes(service?: MemberServicePort) {
  return factory
    .createApp()
    .use("/members", provideMemberService(service))
    .use("/members/*", provideMemberService(service))
    .route("/", memberRoutes);
}

export type { MemberServicePort } from "./context";
