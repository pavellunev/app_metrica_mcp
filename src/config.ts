export interface Config {
  oauthToken: string;
  allowWrite: boolean;
}

export function loadConfig(): Config {
  const oauthToken = process.env.APPMETRICA_OAUTH_TOKEN;
  if (!oauthToken) {
    throw new Error("APPMETRICA_OAUTH_TOKEN env variable is required");
  }

  const allowWrite = process.env.APPMETRICA_ALLOW_WRITE === "true";

  return { oauthToken, allowWrite };
}
