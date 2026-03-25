const GITHUB_API = "https://api.github.com";

async function githubFetch<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`${GITHUB_API}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
    },
  });

  if (!res.ok) {
    throw new Error(`GitHub API ${path} returned ${res.status}: ${res.statusText}`);
  }

  return res.json() as Promise<T>;
}

export type GitHubUser = {
  login: string;
  id: number;
  name: string | null;
  avatar_url: string;
  email: string | null;
};

export type GitHubOrg = {
  login: string;
  id: number;
  description: string | null;
  avatar_url: string;
};

export async function fetchGitHubAccessReview(token: string) {
  const user = await githubFetch<GitHubUser>("/user", token);

  let orgs: GitHubOrg[] = [];
  try {
    orgs = await githubFetch<GitHubOrg[]>("/user/orgs", token);
  } catch {
    // orgs may be empty or inaccessible — not a failure
  }

  return { user, orgs };
}
