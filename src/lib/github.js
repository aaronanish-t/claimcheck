import {
  classifyPolicy,
  findLinkedPolicies,
  KNOWN_PROJECTS,
  mergeFlags,
  ORG_POLICY_FILES,
  REPO_POLICY_FILES,
} from "./policy.js";

const ext = globalThis.browser ?? globalThis.chrome;
const POLICY_TTL = 24 * 60 * 60 * 1000;
const MAX_PAGES = 3;

export class RateLimitError extends Error {
  constructor(resetAt) {
    super("GitHub API rate limit reached");
    this.resetAt = resetAt;
  }
}

async function getToken() {
  try {
    const { token } = await ext.storage.local.get("token");
    return token || null;
  } catch {
    return null;
  }
}

async function api(path, token) {
  const headers = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const res = await fetch(`https://api.github.com${path}`, { headers });
  if ((res.status === 403 || res.status === 429) && res.headers.get("x-ratelimit-remaining") === "0") {
    throw new RateLimitError(Number(res.headers.get("x-ratelimit-reset")) * 1000);
  }
  if (!res.ok) {
    throw new Error(`GitHub API ${res.status} for ${path}`);
  }
  return { data: await res.json(), link: res.headers.get("link") };
}

async function apiPaged(path, token) {
  const out = [];
  let url = `${path}${path.includes("?") ? "&" : "?"}per_page=100`;
  for (let page = 0; page < MAX_PAGES && url; page++) {
    const { data, link } = await api(url, token);
    out.push(...data);
    const next = /<https:\/\/api\.github\.com([^>]+)>;\s*rel="next"/.exec(link || "");
    url = next ? next[1] : null;
  }
  return out;
}

/** Fetches everything needed to judge whether an issue is taken. */
export async function fetchIssueData({ owner, repo, number }) {
  const token = await getToken();
  const base = `/repos/${owner}/${repo}/issues/${number}`;
  const [{ data: issue }, comments, timeline] = await Promise.all([
    api(base, token),
    apiPaged(`${base}/comments`, token),
    apiPaged(`${base}/timeline`, token),
  ]);
  return { issue, comments, timeline, authenticated: !!token };
}

/** raw.githubusercontent.com isn't rate limited like the API. */
async function fetchRaw(owner, repo, path) {
  try {
    const res = await fetch(`https://raw.githubusercontent.com/${owner}/${repo}/HEAD/${path}`);
    return res.ok ? await res.text() : null;
  } catch {
    return null;
  }
}

function blobUrl(owner, repo, path) {
  return `https://github.com/${owner}/${repo}/blob/HEAD/${path}`;
}

async function readCache(key) {
  try {
    const { [key]: entry } = await ext.storage.local.get(key);
    if (entry && Date.now() - entry.at < POLICY_TTL) {
      return entry.value;
    }
  } catch {}
  return null;
}

async function writeCache(key, value) {
  try {
    await ext.storage.local.set({ [key]: { at: Date.now(), value } });
  } catch {}
}

/**
 * Reads the repo's (and org's) contribution docs and returns policy flags.
 * @returns {Promise<{flags: Array, files: string[]}>}
 */
export async function fetchPolicy({ owner, repo }, { refresh = false } = {}) {
  const key = `policy:${owner}/${repo}`.toLowerCase();
  if (!refresh) {
    const cached = await readCache(key);
    if (cached) {
      return cached;
    }
  }

  const docs = [];
  const repoTexts = await Promise.all(REPO_POLICY_FILES.map(p => fetchRaw(owner, repo, p)));
  REPO_POLICY_FILES.forEach((path, i) => {
    if (repoTexts[i]) {
      docs.push({ owner, repo, path, text: repoTexts[i] });
    }
  });

  // Org-wide defaults apply where the repo has no file of its own.
  const hasOwn = name => docs.some(d => d.path.split("/").pop() === name);
  const orgTexts = await Promise.all(ORG_POLICY_FILES.map(p => fetchRaw(owner, ".github", p)));
  ORG_POLICY_FILES.forEach((path, i) => {
    if (orgTexts[i] && !hasOwn(path.split("/").pop())) {
      docs.push({ owner, repo: ".github", path, text: orgTexts[i] });
    }
  });

  // Follow links to separate AI policy documents, one level deep.
  const linked = docs.flatMap(d =>
    findLinkedPolicies(d.text, {
      owner: d.owner,
      repo: d.repo,
      dir: d.path.split("/").slice(0, -1).join("/"),
    })
  );
  for (const target of linked) {
    if (docs.some(d => d.owner === target.owner && d.repo === target.repo && d.path === target.path)) {
      continue;
    }
    const text = await fetchRaw(target.owner, target.repo, target.path);
    if (text) {
      // Dedicated AI policies are the most specific source, so check them first.
      docs.unshift({ ...target, text });
    }
  }

  const flags = mergeFlags(
    docs.map(d => classifyPolicy(d.text, blobUrl(d.owner, d.repo, d.path)))
  );
  const known = KNOWN_PROJECTS[`${owner}/${repo}`.toLowerCase()];
  if (known) {
    flags.unshift({ id: "known", note: true, ...known });
  }

  const value = { flags, files: docs.map(d => blobUrl(d.owner, d.repo, d.path)) };
  await writeCache(key, value);
  return value;
}
