export function getGitHubEnv() {
  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET must be set");
  }

  return { clientId, clientSecret };
}

/** Stable app origin for OAuth redirects. Falls back to request origin for local dev. */
export function getAppUrl(requestUrl?: string): string {
  if (process.env.APP_URL) {
    return process.env.APP_URL.replace(/\/+$/, "");
  }
  if (requestUrl) {
    return new URL(requestUrl).origin;
  }
  throw new Error("APP_URL is not set and no request URL available");
}
