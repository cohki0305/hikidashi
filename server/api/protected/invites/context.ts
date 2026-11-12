import type { MemberServicePort } from "@/server/api/protected/members/context";

export { provideMemberService } from "@/server/api/protected/members/context";
export type { MemberServicePort };

export type InvitesEnv = { Variables: { memberService: MemberServicePort } };
