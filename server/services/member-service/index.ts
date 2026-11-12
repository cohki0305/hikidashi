import { hashToken, toBase64Url } from "@/server/lib/oauth/token";
import { forbidden, invalid, notFound, ok, type Result } from "@/server/lib/result";
import type { InviteLinkRepository } from "@/server/repositories/invite-link-repository";
import type { MemberRepository } from "@/server/repositories/member-repository";
import type { CreatedInvite, InviteItem, MemberItem } from "@/shared/schemas/members";

const DAY_MS = 24 * 60 * 60 * 1000;
/** 招待リンクの有効期間（7 日）。 */
const INVITE_TTL_MS = 7 * DAY_MS;
/** 使えない理由は区別せず、どれも同じ文言にする。 */
const UNUSABLE_INVITE_MESSAGE = "このリンクは使えません";

const lower = (email: string) => email.toLowerCase();

/** 招待の鍵。`hkd_iv_` + 32 バイトの base64url。 */
const generateInviteKey = () => `hkd_iv_${toBase64Url(crypto.getRandomValues(new Uint8Array(32)))}`;

export type MemberServiceDeps = {
  members: Pick<MemberRepository, "find" | "listActive" | "upsertJoined" | "markRemoved">;
  inviteLinks: Pick<InviteLinkRepository, "create" | "findByKeyHash" | "listByCreator" | "revoke">;
  /** 外した人の OAuth のつながりをすべて取り消す。 */
  revokeGrantsFor: (email: string) => Promise<Result<void>>;
  /** 常にメンバーとみなす人。外せない。 */
  ownerEmails: readonly string[];
  now?: () => Date;
  randomKey?: () => string;
  /** 招待リンクの URL に使う自分の URL。無ければ `/join?key=...` を返す。 */
  appUrl?: string;
};

/** メンバーの判定・招待リンク・一覧・外すを受け持つ。 */
export class MemberService {
  private readonly owners: Set<string>;

  constructor(private readonly deps: MemberServiceDeps) {
    this.owners = new Set(deps.ownerEmails.map(lower));
  }

  private now(): Date {
    return this.deps.now?.() ?? new Date();
  }

  /** オーナーか、外していないメンバーなら true。読めないときは入れない（fail closed）。 */
  async isMember(email: string): Promise<boolean> {
    const normalized = lower(email);
    if (this.owners.has(normalized)) return true;
    const found = await this.deps.members.find(normalized);
    if (!found.ok) return false;
    return found.value !== null && found.value.removedAt === null;
  }

  /** 招待リンクを作る。メンバーだけが作れる。 */
  async createInvite(byEmail: string): Promise<Result<CreatedInvite>> {
    if (!(await this.isMember(byEmail))) return forbidden("招待リンクを作れるのはメンバーだけです");

    const key = (this.deps.randomKey ?? generateInviteKey)();
    const now = this.now();
    const createdAt = now.toISOString();
    const expiresAt = new Date(now.getTime() + INVITE_TTL_MS).toISOString();
    const id = crypto.randomUUID();
    const created = await this.deps.inviteLinks.create({
      id,
      keyHash: await hashToken(key),
      createdBy: lower(byEmail),
      createdAt,
      expiresAt,
      revokedAt: null
    });
    if (!created.ok) return created;

    const base = (this.deps.appUrl ?? "").replace(/\/+$/, "");
    return ok({ id, url: `${base}/join?key=${key}`, expiresAt });
  }

  /** 自分が作った、まだ使える招待リンクを新しい順に返す。鍵と url は返さない。 */
  async listInvites(byEmail: string): Promise<Result<InviteItem[]>> {
    if (!(await this.isMember(byEmail)))
      return forbidden("招待リンクを見られるのはメンバーだけです");

    const listed = await this.deps.inviteLinks.listByCreator(lower(byEmail));
    if (!listed.ok) return listed;

    const now = this.now().toISOString();
    return ok(
      listed.value
        .filter((link) => link.revokedAt === null && link.expiresAt > now)
        .map((link) => ({
          id: link.id,
          createdAt: link.createdAt,
          expiresAt: link.expiresAt
        }))
    );
  }

  /** リンクを開いた人をメンバーにする。すでにメンバーなら何もしない。 */
  async redeem(email: string, key: string): Promise<Result<{ joined: boolean }>> {
    const normalized = lower(email);
    if (await this.isMember(normalized)) return ok({ joined: false });

    const now = this.now();
    const found = await this.deps.inviteLinks.findByKeyHash(await hashToken(key));
    if (!found.ok) return found;
    const link = found.value;
    if (link === null || link.revokedAt !== null || link.expiresAt <= now.toISOString())
      return invalid(UNUSABLE_INVITE_MESSAGE);

    const saved = await this.deps.members.upsertJoined({
      email: normalized,
      joinedAt: now.toISOString(),
      inviteLinkId: link.id
    });
    if (!saved.ok) return saved;
    return ok({ joined: true });
  }

  /** 有効なメンバーとオーナーを、入った日の新しい順に返す。 */
  async list(): Promise<Result<MemberItem[]>> {
    const active = await this.deps.members.listActive();
    if (!active.ok) return active;

    const items = new Map<string, MemberItem>();
    for (const row of active.value) {
      items.set(row.email, { email: row.email, joinedAt: row.joinedAt, isOwner: false });
    }
    const fallbackJoinedAt = this.now().toISOString();
    for (const owner of this.owners) {
      const existing = items.get(owner);
      if (existing) items.set(owner, { ...existing, isOwner: true });
      else items.set(owner, { email: owner, joinedAt: fallbackJoinedAt, isOwner: true });
    }

    return ok(
      [...items.values()].sort(
        (a, b) => b.joinedAt.localeCompare(a.joinedAt) || a.email.localeCompare(b.email)
      )
    );
  }

  /** メンバーを外す。オーナーと自分は外せない。 */
  async remove(byEmail: string, target: string): Promise<Result<void>> {
    const actor = lower(byEmail);
    const email = lower(target);
    if (this.owners.has(email)) return forbidden("最初のメンバーは外せません");
    if (email === actor) return forbidden("自分は外せません");

    const found = await this.deps.members.find(email);
    if (!found.ok) return found;
    if (found.value === null || found.value.removedAt !== null)
      return notFound("そのメンバーは見つかりません");

    const removed = await this.deps.members.markRemoved({
      email,
      removedAt: this.now().toISOString(),
      removedBy: actor
    });
    if (!removed.ok) return removed;
    if (!removed.value) return notFound("そのメンバーは見つかりません");

    const revoked = await this.deps.revokeGrantsFor(email);
    if (!revoked.ok) return revoked;
    return ok(undefined);
  }

  /** 招待リンクを止める。メンバーだけが止められる。 */
  async revokeInvite(byEmail: string, inviteId: string): Promise<Result<void>> {
    if (!(await this.isMember(byEmail)))
      return forbidden("招待リンクを止められるのはメンバーだけです");

    const revoked = await this.deps.inviteLinks.revoke({
      id: inviteId,
      revokedAt: this.now().toISOString()
    });
    if (!revoked.ok) return revoked;
    if (!revoked.value) return notFound("このリンクは見つかりません");
    return ok(undefined);
  }
}
