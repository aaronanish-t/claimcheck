// Reads a repo's contribution docs and flags rules about AI use and PRs.
// Every flag carries the sentence it came from and a link to the file, because
// keyword matching can misread a policy: the panel shows evidence, not a ruling.

/** Files checked in the repo itself, most specific first. */
export const REPO_POLICY_FILES = [
  "AI_POLICY.md",
  ".github/AI_POLICY.md",
  "AGENTS.md",
  "CONTRIBUTING.md",
  ".github/CONTRIBUTING.md",
  "docs/CONTRIBUTING.md",
  ".github/PULL_REQUEST_TEMPLATE.md",
  ".github/pull_request_template.md",
];

/** Files checked in the owner's `.github` repo (org-wide defaults). */
export const ORG_POLICY_FILES = [
  "AI_POLICY.md",
  "CONTRIBUTING.md",
  ".github/AI_POLICY.md",
];

export const SEVERITY_ORDER = { high: 0, medium: 1, low: 2, info: 3 };

export const RULES = [
  {
    id: "no-outside-prs",
    label: "Outside PRs restricted",
    severity: "high",
    patterns: [
      /\b(?:not|no longer) (?:currently )?accept(?:ing)? (?:any )?(?:outside |external |third[- ]party |new )?(?:pull requests|PRs|contributions)\b/i,
      /\b(?:pull requests|PRs) (?:are|have been) (?:currently |temporarily )?(?:paused|disabled|closed to)\b/i,
      /\bonly (?:accept|allow|review)s? (?:pull requests|PRs|contributions) from\b/i,
      /\b(?:approved|trusted) contributors\b[^.]{0,80}\b(?:pull requests|PRs)\b/i,
      /\b(?:pull requests|PRs)\b[^.]{0,80}\b(?:will be|are) (?:automatically |auto-)?closed\b[^.]{0,60}\bunless\b/i,
      /\baccepts? (?:pull requests|PRs|contributions) from\b[^.]{0,200}\bapproved\b/i,
      /\b(?:any )?other (?:pull requests?|PRs?) (?:is|are|will be) closed automatically\b/i,
    ],
  },
  {
    id: "ai-banned",
    label: "AI-generated contributions banned",
    severity: "high",
    // "does not prohibit the use of AI" is the opposite of a ban.
    exclude: [/\b(?:not|n't|never)\s+(?:\w+\s+){0,2}(?:prohibit|ban|forbid)/i],
    patterns: [
      /\b(?:do not|don't|must not|may not) (?:use|submit)\b[^.]{0,40}\b(?:AI|LLMs?|generative AI|ChatGPT|Copilot)\b/i,
      /\b(?:AI|LLM)[- ]generated (?:code|contributions?|pull requests|PRs|content|patches)\b[^.]{0,60}\b(?:not (?:be )?(?:accepted|allowed|welcome)|prohibited|banned|rejected)\b/i,
      /\b(?:prohibit|ban|forbid)s? (?:the )?use of (?:AI|LLMs?|generative)\b/i,
    ],
  },
  {
    id: "no-agents",
    label: "Limits on AI agents",
    severity: "high",
    patterns: [
      /\b(?:autonomous|AI|coding) agents?\b[^.]{0,100}\b(?:not (?:be )?(?:allowed|permitted)|should avoid|must not|may not|prohibited|will be closed)\b/i,
      /\b(?:do not|don't) (?:allow|accept)\b[^.]{0,30}\b(?:autonomous )?agents?\b/i,
      /\bshould avoid using AI agents\b/i,
      /\bpull requests must not be opened by automated tooling\b/i,
      /\b(?:cannot|can't|must not|may not) (?:create|open|submit) (?:a )?(?:pull requests?|PRs?|issues?)\b[^.]{0,80}\bwithout\b/i,
    ],
  },
  {
    id: "own-words",
    label: "Comments/PR text must be your own words",
    severity: "medium",
    patterns: [
      /\bin your own (?:words|voice)\b/i,
      /\bdo not quote an? (?:LLM|AI)\b/i,
      /\b(?:comments?|issues?|replies|responses|descriptions?)\b[^.]{0,80}\b(?:written by (?:a )?humans?|not (?:be )?(?:AI|LLM)[- ]generated)\b/i,
      /\bAI should not be used to generate comments\b/i,
      /\bdo not copy responses from (?:the )?AI\b/i,
    ],
  },
  {
    id: "gfi-no-ai",
    label: "No AI on good first issues",
    severity: "medium",
    patterns: [
      /\bgood[- ]first[- ](?:issues?|bugs?)\b[^.]{0,140}\b(?:AI|LLMs?)\b/i,
      /\b(?:AI|LLMs?)\b[^.]{0,140}\bgood[- ]first[- ](?:issues?|bugs?)\b/i,
    ],
  },
  {
    id: "disclose",
    label: "Disclose AI use",
    severity: "medium",
    patterns: [
      /\bdisclos(?:e|ure|ing)\b[^.]{0,100}\b(?:AI|LLMs?|tools?|assistan(?:ce|ts?))\b/i,
      /\b(?:AI|LLMs?)\b[^.]{0,80}\bdisclos(?:e|ed|ure)\b/i,
    ],
  },
  {
    id: "issue-first",
    label: "Discuss in an issue before a PR",
    severity: "low",
    patterns: [
      /\b(?:open|file|create) an issue (?:first|before)\b/i,
      /\bdiscuss(?:ed)?\b[^.]{0,60}\bbefore (?:opening|submitting|sending|starting) (?:a |the |your )?(?:pull request|PR|work)\b/i,
    ],
  },
  {
    id: "cla",
    label: "CLA required",
    severity: "low",
    patterns: [/\b(?:sign|signed|agree to) (?:the |a |our )?(?:CLA|Contributor License Agreement)\b/i],
  },
  {
    id: "ai-ok",
    label: "AI tools allowed",
    severity: "info",
    patterns: [
      /\bwe support using AI\b/i,
      /\bdoes not prohibit the use of AI\b/i,
      /\b(?:AI|LLM)(?: tools?| assistance)?\b[^.]{0,30}\b(?:is|are) (?:welcome|allowed|permitted|fine)\b/i,
    ],
  },
];

/** Splits markdown into sentence-ish chunks, dropping link targets and markup. */
export function toSentences(markdown) {
  const text = markdown
    // PR templates keep their guidance inside HTML comments, so keep the text.
    .replace(/<!--|-->/g, "\n\n")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\[[^\]]*\]/g, "$1")
    .replace(/[*_`]+/g, "");
  return text
    .split(/(?<=[.!?])\s+|\n\s*\n|\n(?=\s*(?:[-*+]|\d+\.|#{1,6})\s)/)
    .map(s => s.replace(/^\s*(?:[-*+]|\d+\.|#{1,6}|>)\s*/, "").replace(/\s+/g, " ").trim())
    .filter(s => s.length > 3);
}

/**
 * Classifies one policy document.
 * @returns {Array<{id,label,severity,quote,source}>} at most one flag per rule.
 */
export function classifyPolicy(markdown, source) {
  const flags = [];
  const sentences = toSentences(markdown);
  for (const rule of RULES) {
    for (const sentence of sentences) {
      if (rule.exclude?.some(re => re.test(sentence))) {
        continue;
      }
      if (rule.patterns.some(re => re.test(sentence))) {
        flags.push({
          id: rule.id,
          label: rule.label,
          severity: rule.severity,
          quote: sentence.length > 260 ? sentence.slice(0, 257) + "…" : sentence,
          source,
        });
        break;
      }
    }
  }
  return flags;
}

/** Merges flags from several documents: one per rule, from the most specific file. */
export function mergeFlags(perFile) {
  const byId = new Map();
  for (const flags of perFile) {
    for (const f of flags) {
      if (!byId.has(f.id)) {
        byId.set(f.id, f);
      }
    }
  }
  // "AI tools allowed" is noise next to a ban.
  if (byId.has("ai-banned")) {
    byId.delete("ai-ok");
  }
  return [...byId.values()].sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
  );
}

/**
 * Finds links in a doc to a separate AI policy (e.g. Node's
 * doc/contributing/ai-guidelines.md, or an org-wide AI_POLICY.md), returned as
 * { owner, repo, path } relative to the given repo.
 */
export function findLinkedPolicies(markdown, { owner, repo, dir = "" }) {
  const out = [];
  const seen = new Set();
  const linkRe = /\]\(([^)\s]+)\)/g;
  for (const m of markdown.matchAll(linkRe)) {
    const href = m[1].split("#")[0];
    if (!/ai[-_]?(?:policy|guidelines|use|contributions?)[^/]*\.md$/i.test(href)) {
      continue;
    }
    let target = null;
    const gh = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/[^/]+\/(.+)$/.exec(href);
    if (gh) {
      target = { owner: gh[1], repo: gh[2], path: gh[3] };
    } else if (!/^[a-z]+:/i.test(href)) {
      const parts = (href.startsWith("/") ? href.slice(1) : (dir ? dir + "/" : "") + href)
        .split("/");
      const resolved = [];
      for (const p of parts) {
        if (p === "..") {
          resolved.pop();
        } else if (p && p !== ".") {
          resolved.push(p);
        }
      }
      target = { owner, repo, path: resolved.join("/") };
    }
    if (target) {
      const key = `${target.owner}/${target.repo}/${target.path}`.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        out.push(target);
      }
    }
  }
  return out;
}

/**
 * Notes for projects whose rules live outside their repo files. Each has a
 * source link so it can be checked; keep this list short and sourced.
 */
export const KNOWN_PROJECTS = {
  "golang/go": {
    label: "Changes go through Gerrit",
    severity: "low",
    quote:
      "Go reviews changes on Gerrit (go-review.googlesource.com). A gopherbot \"Change https://go.dev/cl/...\" comment means a fix is already in review.",
    source: "https://go.dev/doc/contribute",
  },
  "mlflow/mlflow": {
    label: "Needs the `ready` label",
    severity: "high",
    quote:
      "PRs are closed automatically unless a maintainer has put the `ready` label on the linked issue.",
    source: "https://github.com/mlflow/mlflow/blob/master/CONTRIBUTING.md",
  },
};
