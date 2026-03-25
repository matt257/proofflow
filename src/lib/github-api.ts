const GITHUB_API = "https://api.github.com";

async function githubFetch<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`${GITHUB_API}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
    },
  });

  if (!res.ok) {
    throw new Error(
      `GitHub API ${path} returned ${res.status}: ${res.statusText}`,
    );
  }

  return res.json() as Promise<T>;
}

/** Try a fetch; return null on any error instead of throwing. */
async function githubFetchOptional<T>(
  path: string,
  token: string,
): Promise<T | null> {
  try {
    return await githubFetch<T>(path, token);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Types — reflect what GitHub actually returns (subset)
// ---------------------------------------------------------------------------

export type GitHubUser = {
  login: string;
  id: number;
  name: string | null;
  email: string | null;
  avatar_url: string;
  html_url: string;
  type: string;
};

export type GitHubOrg = {
  login: string;
  id: number;
  description: string | null;
  avatar_url: string;
  url: string;
};

export type GitHubMembership = {
  state: string;
  role: string;
  organization: { login: string; id: number };
};

export type GitHubTeam = {
  name: string;
  slug: string;
  id: number;
  privacy: string;
  description: string | null;
  html_url: string;
  parent: { name: string; slug: string; id: number } | null;
  organization: { login: string };
};

// ---------------------------------------------------------------------------
// Snapshot shape (v2)
// ---------------------------------------------------------------------------

export type OrgAccessEntry = {
  org: GitHubOrg;
  membership: GitHubMembership | null;
  teams: GitHubTeam[];
  errors: string[];
};

export type AccessReviewSnapshot = {
  user: GitHubUser;
  orgs: OrgAccessEntry[];
  collectorVersion: number;
};

// ---------------------------------------------------------------------------
// Collector
// ---------------------------------------------------------------------------

export async function fetchGitHubAccessReview(
  token: string,
): Promise<AccessReviewSnapshot> {
  // 1. Authenticated user
  const user = await githubFetch<GitHubUser>("/user", token);

  // 2. Org list
  let rawOrgs: GitHubOrg[] = [];
  try {
    rawOrgs = await githubFetch<GitHubOrg[]>("/user/orgs", token);
  } catch {
    // token may lack org scope — continue with empty
  }

  // 3. Per-org: membership + teams (parallel per org, resilient)
  const orgs: OrgAccessEntry[] = await Promise.all(
    rawOrgs.map(async (org) => {
      const errors: string[] = [];

      // Membership (role + state)
      const membership = await githubFetchOptional<GitHubMembership>(
        `/user/memberships/orgs/${org.login}`,
        token,
      );
      if (!membership) {
        errors.push("Could not fetch membership (may require admin:org scope)");
      }

      // Teams the authenticated user belongs to in this org
      let teams: GitHubTeam[] = [];
      const allTeams = await githubFetchOptional<GitHubTeam[]>(
        `/user/teams`,
        token,
      );
      if (allTeams) {
        teams = allTeams.filter(
          (t) => t.organization?.login === org.login,
        );
      } else {
        errors.push("Could not fetch teams (may require read:org scope)");
      }

      return { org, membership, teams, errors };
    }),
  );

  return { user, orgs, collectorVersion: 2 };
}
