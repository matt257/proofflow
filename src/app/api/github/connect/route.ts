import { NextResponse } from "next/server";
import { getGitHubEnv } from "@/lib/github";

export async function GET(request: Request) {
  const { clientId } = getGitHubEnv();
  const { origin } = new URL(request.url);
  const redirectUri = `${origin}/api/github/callback`;

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: "read:org",
  });

  return NextResponse.redirect(
    `https://github.com/login/oauth/authorize?${params}`,
  );
}
