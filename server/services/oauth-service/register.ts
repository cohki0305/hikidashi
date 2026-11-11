import { isAllowedRedirectUri } from "@/server/lib/oauth/redirect-uri";
import { generateClientId } from "@/server/lib/oauth/token";
import { invalid, ok, type Result } from "@/server/lib/result";
import type { OauthClientRepository } from "@/server/repositories/oauth-client-repository";

const MAX_REDIRECT_URIS = 5;
const MAX_CLIENT_NAME = 100;
const DEFAULT_CLIENT_NAME = "Claude";

export type ClientRegistrationInput = { client_name?: unknown; redirect_uris?: unknown };

export type RegisteredClient = {
  client_id: string;
  client_name: string;
  redirect_uris: string[];
  token_endpoint_auth_method: "none";
  grant_types: ["authorization_code", "refresh_token"];
  response_types: ["code"];
};

function parseRedirectUris(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const uris: string[] = [];
  for (const uri of value) {
    if (typeof uri !== "string") return null;
    uris.push(uri);
  }
  return uris;
}

/** 連携するアプリを登録する（RFC 7591）。戻り先は許した形だけ、名前は 100 字まで。 */
export async function registerClient(
  deps: { clients: Pick<OauthClientRepository, "create"> },
  input: ClientRegistrationInput
): Promise<Result<RegisteredClient>> {
  const uris = parseRedirectUris(input.redirect_uris);
  if (
    !uris ||
    uris.length < 1 ||
    uris.length > MAX_REDIRECT_URIS ||
    !uris.every(isAllowedRedirectUri)
  )
    return invalid("invalid_redirect_uri");

  const requested = typeof input.client_name === "string" ? input.client_name.trim() : "";
  const clientName = requested.slice(0, MAX_CLIENT_NAME) || DEFAULT_CLIENT_NAME;

  const row = await deps.clients.create({
    id: generateClientId(),
    clientName,
    redirectUris: uris
  });
  if (!row.ok) return row;
  if (!row.value) return invalid("invalid_client_metadata");

  return ok({
    client_id: row.value.id,
    client_name: row.value.clientName,
    redirect_uris: row.value.redirectUris,
    token_endpoint_auth_method: "none",
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"]
  });
}
