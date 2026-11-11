export type AuthorizeParams = {
  responseType?: string;
  clientId?: string;
  redirectUri?: string;
  codeChallenge?: string;
  codeChallengeMethod?: string;
  state?: string;
  resource?: string;
};

export type AuthorizationStart =
  | { kind: "pending"; requestId: string }
  | { kind: "unusable" }
  | { kind: "rejected"; redirectTo: string };

export type TokenSet = { accessToken: string; refreshToken: string; expiresIn: number };

export type RequestDescription = {
  clientName: string;
  redirectHost: string;
  status: "pending" | "expired";
};
