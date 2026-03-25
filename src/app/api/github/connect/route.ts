import { NextResponse } from "next/server";
import { getGitHubEnv, getAppUrl } from "@/lib/github";

export async function GET(request: Request) {
  const { clientId } = getGitHubEnv();
  const appUrl = getAppUrl(request.url);
  const redirectUri = `${appUrl}/api/github/callback`;

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: "read:org",
  });

  return NextResponse.redirect(
    `https://github.com/login/oauth/authorize?${params}`,
  );
}
