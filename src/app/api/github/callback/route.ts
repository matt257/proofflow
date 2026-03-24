import { NextResponse } from "next/server";
import { getGitHubEnv } from "@/lib/github";
import { db } from "@/lib/db";

export async function GET(request: Request) {
  const { clientId, clientSecret } = getGitHubEnv();
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (!code) {
    return NextResponse.json({ error: "Missing code" }, { status: 400 });
  }

  // Exchange code for access token
  const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
    }),
  });

  const tokenData = await tokenRes.json();

  if (tokenData.error) {
    return NextResponse.json(
      { error: tokenData.error_description ?? tokenData.error },
      { status: 400 },
    );
  }

  const accessToken: string = tokenData.access_token;

  // Fetch GitHub user info to confirm the token works
  const userRes = await fetch("https://api.github.com/user", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const githubUser = await userRes.json();

  // Get or create a default workspace
  let workspace = await db.workspace.findFirst();
  if (!workspace) {
    workspace = await db.workspace.create({
      data: { name: "Default Workspace" },
    });
  }

  // Upsert the GitHub integration
  await db.integration.upsert({
    where: {
      workspaceId_provider: {
        workspaceId: workspace.id,
        provider: "github",
      },
    },
    create: {
      workspaceId: workspace.id,
      provider: "github",
      accessToken,
      metadata: {
        githubLogin: githubUser.login,
        githubId: githubUser.id,
        name: githubUser.name,
        avatarUrl: githubUser.avatar_url,
      },
    },
    update: {
      accessToken,
      metadata: {
        githubLogin: githubUser.login,
        githubId: githubUser.id,
        name: githubUser.name,
        avatarUrl: githubUser.avatar_url,
      },
    },
  });

  return NextResponse.redirect(`${origin}/dashboard`);
}
