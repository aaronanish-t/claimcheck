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
      prs: findLinkedPRs(timeline, fullName),
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
    const partial = { verdict: null, error, claims: [], prs: [], gerrit: [], mentioned: [], authenticated: false, policy: null };
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
