// Builds the panel. All untrusted text (comments, titles, policy quotes) goes in
// through textContent, never innerHTML.

const STYLE = `
:host { all: initial; }
.cc {
  /* GitHub's own color variables win when present; the fallbacks are for other pages. */
  --cc-fg: var(--fgColor-default, #1f2328);
  --cc-muted: var(--fgColor-muted, #59636e);
  --cc-bg: var(--bgColor-default, #ffffff);
  --cc-border: var(--borderColor-default, #d1d9e0);
  --cc-accent: var(--fgColor-accent, #0969da);
  --cc-danger: var(--fgColor-danger, #d1242f);
  --cc-attention: var(--fgColor-attention, #9a6700);
  font: 12px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif;
  color: var(--cc-fg);
  background: var(--cc-bg);
  border: 1px solid var(--cc-border);
  border-radius: 6px;
  padding: 10px 12px;
  margin: 0 0 16px;
  box-sizing: border-box;
}
@media (prefers-color-scheme: dark) {
  .cc {
    --cc-fg: var(--fgColor-default, #e6edf3);
    --cc-muted: var(--fgColor-muted, #9198a1);
    --cc-bg: var(--bgColor-default, #0d1117);
    --cc-border: var(--borderColor-default, #3d444d);
    --cc-accent: var(--fgColor-accent, #4493f8);
    --cc-danger: var(--fgColor-danger, #f85149);
    --cc-attention: var(--fgColor-attention, #d29922);
  }
}
.cc.floating {
  position: fixed; right: 16px; bottom: 16px; width: 320px; max-height: 70vh;
  overflow: auto; z-index: 100; box-shadow: 0 8px 24px rgba(1, 4, 9, 0.3);
}
.head { display: flex; align-items: center; gap: 8px; }
.title { font-weight: 600; font-size: 12px; flex: 1; }
.btn {
  font: inherit; cursor: pointer; border: 1px solid var(--cc-border);
  background: transparent; color: inherit; border-radius: 4px; padding: 0 6px;
}
.verdict { margin: 8px 0 4px; display: flex; gap: 8px; align-items: baseline; }
.pill { font-weight: 600; border-radius: 999px; padding: 1px 8px; white-space: nowrap; color: #fff; }
.free { background: var(--bgColor-success-emphasis, #1f883d); }
.maybe { background: var(--bgColor-attention-emphasis, #9a6700); }
.taken { background: var(--bgColor-danger-emphasis, #cf222e); }
.reason, .muted { color: var(--cc-muted); }
h4 {
  margin: 10px 0 4px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.03em;
  color: var(--cc-muted);
}
ul { margin: 0; padding: 0; list-style: none; }
li { margin: 0 0 6px; }
a { color: var(--cc-accent); text-decoration: none; }
a:hover { text-decoration: underline; }
.quote { margin: 2px 0 0; padding-left: 8px; border-left: 2px solid var(--cc-border); color: var(--cc-muted); }
.sev { font-weight: 600; }
.sev-high { color: var(--cc-danger); }
.sev-medium { color: var(--cc-attention); }
.sev-low, .sev-info { color: var(--cc-fg); }
.released { text-decoration: line-through; opacity: 0.7; }
.warn { margin: 8px 0 4px; color: var(--cc-attention); }
.foot { margin-top: 8px; font-size: 11px; }
`;

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "class") {
      node.className = v;
    } else if (k === "onclick") {
      node.addEventListener("click", v);
    } else {
      node.setAttribute(k, v);
    }
  }
  for (const child of children) {
    if (child == null || child === false) {
      continue;
    }
    node.append(typeof child === "string" ? document.createTextNode(child) : child);
  }
  return node;
}

function link(href, text) {
  // Only ever link to GitHub/known https URLs from the API.
  const safe = /^https:\/\//.test(href) ? href : "#";
  return el("a", { href: safe, target: "_blank", rel: "noopener noreferrer" }, text);
}

function day(iso) {
  return iso ? new Date(iso).toISOString().slice(0, 10) : "";
}

const LEVEL_TEXT = { free: "Looks free", maybe: "Possibly claimed", taken: "Taken" };
const STATE_TEXT = { open: "open", merged: "merged", closed: "closed (not merged)" };

/** Creates (or reuses) the shadow host and returns its root container. */
export function mountPanel(anchor) {
  let host = document.getElementById("claimcheck-host");
  if (!host) {
    host = document.createElement("div");
    host.id = "claimcheck-host";
    host.attachShadow({ mode: "open" });
  }
  if (anchor) {
    if (anchor.firstChild !== host) {
      anchor.prepend(host);
    }
  } else if (host.parentNode !== document.body) {
    document.body.append(host);
  }
  const root = host.shadowRoot;
  root.replaceChildren(el("style", {}, STYLE));
  const box = el("div", { class: anchor ? "cc" : "cc floating" });
  root.append(box);
  return box;
}

export function unmountPanel() {
  document.getElementById("claimcheck-host")?.remove();
}

function header(onRefresh, onClose) {
  return el(
    "div",
    { class: "head" },
    el("span", { class: "title" }, "ClaimCheck"),
    onRefresh && el("button", { class: "btn", title: "Refresh", onclick: onRefresh }, "↻"),
    onClose && el("button", { class: "btn", title: "Hide", onclick: onClose }, "×")
  );
}

export function renderLoading(box, { onClose } = {}) {
  box.replaceChildren(header(null, onClose), el("div", { class: "muted" }, "Checking…"));
}

export function renderError(box, message, { onRefresh, onClose } = {}) {
  box.replaceChildren(header(onRefresh, onClose), el("div", { class: "muted" }, message));
}

export function renderAnalysis(box, a, { onRefresh, onClose } = {}) {
  const parts = [header(onRefresh, onClose)];

  if (a.verdict) {
    parts.push(
      el(
        "div",
        { class: "verdict" },
        el("span", { class: `pill ${a.verdict.level}` }, LEVEL_TEXT[a.verdict.level]),
        el("span", { class: "reason" }, a.verdict.reason)
      )
    );
  } else if (a.error) {
    parts.push(el("div", { class: "warn" }, a.error));
  }

  if (a.prs.length) {
    parts.push(el("h4", {}, "Linked pull requests"));
    parts.push(
      el(
        "ul",
        {},
        ...a.prs.map(p =>
          el(
            "li",
            {},
            link(p.url, `${p.external ? p.repo : ""}#${p.number}`),
            ` ${p.title} `,
            el("span", { class: "muted" }, `(${STATE_TEXT[p.state] ?? p.state}, @${p.author})`)
          )
        )
      )
    );
  }

  if (a.mentioned?.length) {
    parts.push(el("h4", {}, "PRs mentioned in comments"));
    parts.push(
      el(
        "ul",
        {},
        ...a.mentioned.map(m =>
          el(
            "li",
            {},
            link(`https://github.com/${a.fullName}/pull/${m.number}`, `#${m.number}`),
            el("span", { class: "muted" }, " mentioned by "),
            link(m.url, `@${m.by}`)
          )
        )
      )
    );
  }

  if (a.gerrit.length) {
    parts.push(el("h4", {}, "Gerrit changes"));
    parts.push(
      el("ul", {}, ...a.gerrit.map(g => el("li", {}, link(g.url, g.url), el("span", { class: "muted" }, ` (${day(g.date)})`))))
    );
  }

  const claims = a.claims.filter(c => !c.isIssueBody);
  if (claims.length) {
    parts.push(el("h4", {}, "Claims"));
    parts.push(
      el(
        "ul",
        {},
        ...claims.map(c =>
          el(
            "li",
            { class: c.released ? "released" : "" },
            link(c.url, `@${c.login}`),
            el("span", { class: "muted" }, ` ${day(c.date)}${c.released ? " (released)" : ""}`),
            el("div", { class: "quote" }, c.snippet)
          )
        )
      )
    );
  }

  parts.push(el("h4", {}, "Contribution policy"));
  if (a.policy === null) {
    parts.push(el("div", { class: "muted" }, "Reading policy files…"));
  } else if (!a.policy.flags.length) {
    parts.push(
      el(
        "div",
        { class: "muted" },
        a.policy.files.length
          ? `No AI or PR rules found in ${a.policy.files.length} file(s). Still worth a skim.`
          : "No CONTRIBUTING, AI_POLICY or AGENTS file found."
      )
    );
  } else {
    parts.push(
      el(
        "ul",
        {},
        ...a.policy.flags.map(f =>
          el(
            "li",
            {},
            el("span", { class: `sev sev-${f.severity}` }, f.label),
            " ",
            link(f.source, f.note ? "source" : f.source.split("/").pop()),
            el("div", { class: "quote" }, f.note ? f.quote : `“${f.quote}”`)
          )
        )
      )
    );
  }

  parts.push(
    el(
      "div",
      { class: "foot muted" },
      "Heuristic: check the linked comments and files before acting.",
      a.authenticated || a.error ? null : " Add a token in the options for a higher rate limit."
    )
  );

  box.replaceChildren(...parts);
}
