import {
  findClaims,
  findGerritChanges,
  findLinkedPRs,
  findMentionedPRs,
  parseIssuePath,
  verdict,
} from "./lib/claims.js";
import { fetchIssueData, fetchPolicy, RateLimitError } from "./lib/github.js";
import {
  mountPanel,
  renderAnalysis,
  renderLoading,
  unmountPanel,
} from "./lib/render.js";

const SIDEBAR_SELECTORS = [
  '[data-testid="issue-viewer-metadata-pane"]',
  "#partial-discussion-sidebar",
  ".Layout-sidebar",
];

let currentKey = null;
let hiddenFor = null;
let run = 0;
// The last rendered analysis, so a re-rendered sidebar can get the panel back
// without new API requests.
let last = null;
let handlers = null;

const ICON_STATE = [
  [/merge/, "merged"],
  [/closed/, "closed"],
  [/draft|pull-request/, "open"],
];

/**
 * Reads the PRs GitHub itself lists under "Development" (PRs that will close
 * the issue). Works without the API, so it covers rate limits and anything the
 * timeline leaves out.
 */
function readPagePRs({ owner, repo }) {
  const fullName = `${owner}/${repo}`;
  const prs = [];
  for (const box of document.querySelectorAll('[data-testid="issue-viewer-linked-pr-container"]')) {
    const a = box.querySelector('a[href*="/pull/"]');
    const m = a && /github\.com\/([^/]+\/[^/]+)\/pull\/(\d+)|^\/([^/]+\/[^/]+)\/pull\/(\d+)/.exec(a.getAttribute("href"));
    if (!m) {
      continue;
    }
    const prRepo = m[1] ?? m[3];
    const number = Number(m[2] ?? m[4]);
    const icon = box.querySelector("svg");
    const label = (icon?.getAttribute("aria-label") || "").toLowerCase();
    const cls = icon?.getAttribute("class") || "";
    let state = ["open", "merged", "closed"].find(s => label.includes(s));
    if (!state) {
      state = ICON_STATE.find(([re]) => re.test(cls))?.[1] ?? "open";
    }
    prs.push({
      number,
      // innerText keeps the line break between the title and the repo name.
      title: (a.innerText || a.textContent || "").trim().split("\n")[0],
      url: `https://github.com/${prRepo}/pull/${number}`,
      state,
      repo: prRepo,
      author: null,
      external: prRepo.toLowerCase() !== fullName.toLowerCase(),
      fromPage: true,
    });
  }
  return prs;
}

/** Adds page-listed PRs the API didn't return. */
function withPagePRs(prs, target) {
  const out = [...prs];
  for (const p of readPagePRs(target)) {
    if (!out.some(q => q.repo.toLowerCase() === p.repo.toLowerCase() && q.number === p.number)) {
      out.push(p);
    }
  }
  return out;
}

function findSidebar() {
  for (const sel of SIDEBAR_SELECTORS) {
    const node = document.querySelector(sel);
    if (node) {
      return node;
    }
  }
  return null;
}

async function check({ refresh = false } = {}) {
  const target = parseIssuePath(location.pathname);
  if (!target) {
    currentKey = null;
    unmountPanel();
    return;
  }
  const key = `${target.owner}/${target.repo}#${target.number}`;
  if (hiddenFor === key) {
    return;
  }
  if (key === currentKey && !refresh && document.getElementById("claimcheck-host")) {
    return;
  }
  currentKey = key;
  const thisRun = ++run;

  handlers = {
    onRefresh: () => check({ refresh: true }),
    onClose: () => {
      hiddenFor = key;
      unmountPanel();
    },
  };
  let box = mountPanel(findSidebar());
  renderLoading(box, handlers);

  try {
    const policyPromise = fetchPolicy(target, { refresh });
    const { issue, comments, timeline, authenticated } = await fetchIssueData(target);
    if (thisRun !== run) {
      return;
    }
    if (issue.pull_request) {
      unmountPanel();
      return;
    }
    const fullName = `${target.owner}/${target.repo}`;
    const analysis = {
      fullName,
      claims: findClaims(comments, issue),
      prs: withPagePRs(findLinkedPRs(timeline, fullName), target),
      gerrit: findGerritChanges(comments),
      authenticated,
      policy: null,
    };
    analysis.mentioned = findMentionedPRs(comments, fullName, {
      issueNumber: target.number,
      linked: analysis.prs.filter(p => !p.external).map(p => p.number),
    });
    analysis.verdict = verdict({ issue, ...analysis });

    // GitHub re-renders the page as it loads; re-mount if our host was dropped.
    box = mountPanel(findSidebar());
    renderAnalysis(box, analysis, handlers);
    last = { key, analysis };

    analysis.policy = await policyPromise.catch(() => ({ flags: [], files: [] }));
    if (thisRun === run) {
      box = mountPanel(findSidebar());
      renderAnalysis(box, analysis, handlers);
    }
  } catch (e) {
    if (thisRun !== run) {
      return;
    }
    const error =
      e instanceof RateLimitError
        ? `Can't check claims: GitHub's rate limit for this network resets at ${new Date(e.resetAt).toLocaleTimeString()}. Add a token in the extension options to avoid this.`
        : `Couldn't check this issue (${e.message}).`;
    // Policy files don't use the API, so they can still be shown.
    const pagePRs = withPagePRs([], target);
    const partial = { fullName: `${target.owner}/${target.repo}`, verdict: null, error, claims: [], prs: pagePRs, gerrit: [], mentioned: [], authenticated: false, policy: null };
    const pageVerdict = verdict({ issue: { state: "open", assignees: [] }, ...partial });
    if (pageVerdict.level === "taken") {
      // A linked open or merged PR settles it even without the API.
      partial.verdict = pageVerdict;
    }
    renderAnalysis(mountPanel(findSidebar()), partial, handlers);
    last = { key, analysis: partial };
    partial.policy = await fetchPolicy(target, { refresh }).catch(() => ({ flags: [], files: [] }));
    if (thisRun === run) {
      renderAnalysis(mountPanel(findSidebar()), partial, handlers);
    }
  }
}

// GitHub navigates without full page loads, so watch the URL and the DOM.
let lastPath = null;
function onChange() {
  if (location.pathname !== lastPath) {
    lastPath = location.pathname;
    check();
  } else if (currentKey && !document.getElementById("claimcheck-host") && hiddenFor !== currentKey) {
    // The sidebar was re-rendered and took our panel with it.
    if (last?.key === currentKey) {
      renderAnalysis(mountPanel(findSidebar()), last.analysis, handlers);
    } else {
      currentKey = null;
      check();
    }
  }
}

document.addEventListener("turbo:load", onChange);
window.addEventListener("popstate", onChange);
new MutationObserver(() => {
  clearTimeout(onChange.t);
  onChange.t = setTimeout(onChange, 300);
}).observe(document.body, { childList: true, subtree: true });
onChange();
