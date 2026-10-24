// Pure helpers that turn GitHub API data into a "is this issue taken?" analysis.

/** Parses `/owner/repo/issues/123` (with optional trailing parts). */
export function parseIssuePath(pathname) {
  const m = /^\/([^/]+)\/([^/]+)\/issues\/(\d+)(?:[/?#]|$)/.exec(pathname);
  if (!m) {
    return null;
  }
  return { owner: m[1], repo: m[2], number: Number(m[3]) };
}

// Phrases people use to claim an issue. Kept specific on purpose: a false
// "claimed" verdict is worse than a missed one, because the panel always
// links the comments anyway.
const CLAIM_PATTERNS = [
  /\bI(?:'| a)?m (?:currently |now )?working on (?:this|it|a fix|a pr|a patch)\b/i,
  /\bI(?:'d| would) (?:like|love) to (?:work on|take|tackle|pick up|fix|help (?:with|fix))\b/i,
  /\b(?:can|could|may) I (?:work on|take|pick up|tackle|be assigned|get assigned|claim)\b/i,
  /\bI(?:'ll| will) (?:take|work on|pick up|tackle|fix|open a pr|submit a pr|send a pr)\b/i,
  /\b(?:please )?assign (?:it|this(?: issue)?) to me\b/i,
  /\bI(?:'d| would) be happy to (?:work on|take|fix|implement|submit|open)\b/i,
  /\bI(?:'ve| have) (?:opened|submitted|created|raised) (?:a |the )?(?:pr|pull request|patch)\b/i,
  /\bI(?:'d| would) like to (?:claim|be assigned)\b/i,
  /\bis (?:this|it) (?:still )?(?:available|open for contribution|up for grabs)\b/i,
];

// Phrases a claimer uses to give an issue back.
const RELEASE_PATTERNS = [
  /\bI(?:'m| am) (?:no longer|not) (?:working on|able to (?:work on|continue|finish))\b/i,
  /\b(?:feel free|anyone is welcome|someone else can|happy for (?:someone|anyone)) (?:else )?to (?:take|pick|work)\b/i,
  /\bunassign(?:ing)? myself\b/i,
];

const GERRIT_PATTERNS = [
  /Change (https:\/\/go\.dev\/cl\/\d+) mentions this issue/,
  /(https:\/\/[\w.-]+-review\.googlesource\.com\/c\/[^\s)>\]]+)/,
];

export function isBot(user) {
  if (!user) {
    return true;
  }
  return user.type === "Bot" || /\[bot\]$/.test(user.login);
}

/** Returns the sentence around `index` in `text`, trimmed to `max` chars. */
export function snippetAround(text, index, max = 160) {
  const flat = text.replace(/\s+/g, " ");
  // `index` refers to the original text; re-find it approximately in the
  // flattened text by counting characters before it.
  const before = text.slice(0, index).replace(/\s+/g, " ").length;
  let start = flat.lastIndexOf(". ", before);
  start = start === -1 ? 0 : start + 2;
  let end = flat.indexOf(". ", before);
  end = end === -1 ? flat.length : end + 1;
  let s = flat.slice(start, end).trim();
  if (s.length > max) {
    const rel = Math.max(0, before - start - max / 2);
    s = (rel > 0 ? "…" : "") + s.slice(rel, rel + max).trim() + "…";
  }
  return s;
}

/** Strips quoted replies (`> ...`) and fenced code, which aren't the commenter's own claim. */
function ownText(body) {
  return (body || "")
    .replace(/```[\s\S]*?```/g, " ")
    .split("\n")
    .filter(line => !line.trimStart().startsWith(">"))
    .join("\n");
}

/**
 * Finds claim comments. A claim is "released" if the same person later posts
 * a release phrase.
 * @param {Array} comments GitHub issue comments (oldest first).
 * @param {object} [issue] The issue itself; its body counts as a comment by the author.
 */
export function findClaims(comments, issue) {
  const all = [];
  if (issue?.body) {
    all.push({
      user: issue.user,
      body: issue.body,
      created_at: issue.created_at,
      html_url: issue.html_url,
      isIssueBody: true,
    });
  }
  all.push(...comments);

  const claims = [];
  for (const c of all) {
    if (isBot(c.user)) {
      continue;
    }
    const text = ownText(c.body);
    const login = c.user.login;

    if (RELEASE_PATTERNS.some(re => re.test(text))) {
      for (const claim of claims) {
        if (claim.login === login) {
          claim.released = true;
        }
      }
      continue;
    }

    for (const re of CLAIM_PATTERNS) {
      const m = re.exec(text);
      if (m) {
        claims.push({
          login,
          date: c.created_at,
          url: c.html_url,
          snippet: snippetAround(text, m.index),
          isIssueBody: !!c.isIssueBody,
          released: false,
        });
        break;
      }
    }
  }
  return claims;
}

/** Finds Gerrit changes (Go and other googlesource projects) mentioned in comments. */
export function findGerritChanges(comments) {
  const seen = new Map();
  for (const c of comments) {
    for (const re of GERRIT_PATTERNS) {
      const m = re.exec(c.body || "");
      if (m && !seen.has(m[1])) {
        seen.set(m[1], { url: m[1], date: c.created_at, by: c.user?.login });
      }
    }
  }
  return [...seen.values()];
}

/**
 * Extracts pull requests that reference the issue from timeline events.
 * @returns {Array<{number:number, title:string, url:string, state:"open"|"merged"|"closed", repo:string, author:string, external:boolean}>}
 */
export function findLinkedPRs(timeline, fullName) {
  const prs = new Map();
  for (const ev of timeline) {
    if (ev.event !== "cross-referenced") {
      continue;
    }
    const src = ev.source?.issue;
    if (!src?.pull_request) {
      continue;
    }
    const repo = src.repository?.full_name ?? fullName;
    const key = `${repo}#${src.number}`;
    let state = src.state;
    if (src.pull_request.merged_at) {
      state = "merged";
    }
    prs.set(key, {
      number: src.number,
      title: src.title,
      url: src.html_url,
      state,
      repo,
      author: src.user?.login,
      external: repo.toLowerCase() !== fullName.toLowerCase(),
    });
  }
  return [...prs.values()];
}

/**
 * Finds same-repo PR numbers that comments point to ("PR is already open for
 * this: #123", ".../pull/123") but that the timeline doesn't link, e.g. a PR
 * opened before the issue existed.
 */
export function findMentionedPRs(comments, fullName, { issueNumber, linked = [] } = {}) {
  const skip = new Set([issueNumber, ...linked]);
  const found = new Map();
  const [owner, repo] = fullName.toLowerCase().split("/");
  const textPatterns = [
    /\b(?:PR|pull request)\b[^.\n#]{0,60}#(\d+)/gi,
    /#(\d+)\s+(?:is|was)?\s*(?:an?\s+)?(?:open\s+|existing\s+)?(?:PR|pull request)\b/gi,
  ];
  const urlPattern = /github\.com\/([\w.-]+)\/([\w.-]+)\/pull\/(\d+)/gi;
  for (const c of comments) {
    if (isBot(c.user)) {
      continue;
    }
    const text = ownText(c.body);
    const add = n => {
      if (!skip.has(n) && !found.has(n)) {
        found.set(n, { number: n, by: c.user.login, url: c.html_url });
      }
    };
    for (const re of textPatterns) {
      for (const m of text.matchAll(re)) {
        add(Number(m[1]));
      }
    }
    for (const m of text.matchAll(urlPattern)) {
      if (m[1].toLowerCase() === owner && m[2].toLowerCase() === repo) {
        add(Number(m[3]));
      }
    }
  }
  return [...found.values()];
}

/**
 * Combines everything into a verdict.
 * @returns {{level:"free"|"maybe"|"taken", reason:string}}
 */
export function verdict({ issue, claims, prs, gerrit, mentioned = [] }) {
  const ownPRs = prs.filter(p => !p.external);
  const open = ownPRs.filter(p => p.state === "open");
  const merged = ownPRs.filter(p => p.state === "merged");
  const activeClaims = claims.filter(c => !c.released && !c.isIssueBody);

  if (issue.state === "closed") {
    return { level: "taken", reason: "Issue is closed" };
  }
  if (open.length) {
    return {
      level: "taken",
      reason: `Open PR ${open.map(p => "#" + p.number).join(", ")}`,
    };
  }
  if (merged.length) {
    return {
      level: "taken",
      reason: `Merged PR ${merged.map(p => "#" + p.number).join(", ")}`,
    };
  }
  if (gerrit.length) {
    return { level: "taken", reason: "Patch in review on Gerrit" };
  }
  if (mentioned.length) {
    return {
      level: "maybe",
      reason: `PR ${mentioned.map(p => "#" + p.number).join(", ")} mentioned in comments`,
    };
  }
  if (issue.assignees?.length) {
    return {
      level: "maybe",
      reason: `Assigned to ${issue.assignees.map(a => "@" + a.login).join(", ")}`,
    };
  }
  if (activeClaims.length) {
    const who = [...new Set(activeClaims.map(c => "@" + c.login))];
    return { level: "maybe", reason: `Claimed by ${who.join(", ")}` };
  }
  return { level: "free", reason: "No claims, assignees or linked PRs" };
}
