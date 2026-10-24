import { describe, expect, it } from "vitest";
import {
  findClaims,
  findGerritChanges,
  findLinkedPRs,
  findMentionedPRs,
  parseIssuePath,
  verdict,
} from "../src/lib/claims.js";

const user = login => ({ login, type: "User" });
const comment = (login, body, extra = {}) => ({
  user: user(login),
  body,
  created_at: "2026-10-16T09:36:29Z",
  html_url: `https://github.com/o/r/issues/1#issuecomment-${login}`,
  ...extra,
});

describe("parseIssuePath", () => {
  it("parses issue URLs", () => {
    expect(parseIssuePath("/nodejs/node/issues/66349")).toEqual({
      owner: "nodejs",
      repo: "node",
      number: 66349,
    });
    expect(parseIssuePath("/o/r/issues/12/")).toMatchObject({ number: 12 });
  });

  it("ignores other pages", () => {
    expect(parseIssuePath("/o/r/issues")).toBeNull();
    expect(parseIssuePath("/o/r/pull/12")).toBeNull();
    expect(parseIssuePath("/o/r/issues/new")).toBeNull();
  });
});

describe("findClaims", () => {
  it("finds common claim phrases", () => {
    const phrases = [
      "hey, I'd like to take this one.",
      "Can I work on this?",
      "I'm working on a fix, PR soon",
      "Please assign this to me",
      "I'll take this",
      "Hi — I'm interested in helping. Is this still available?",
    ];
    for (const p of phrases) {
      expect(findClaims([comment("a", p)]), p).toHaveLength(1);
    }
  });

  it("ignores unrelated comments", () => {
    const phrases = [
      "Reproduced on Linux, macOS and Windows.",
      "I think the issue is in the realpath walk.",
      "Thanks for the report!",
      "This would be a great first issue for someone.",
    ];
    for (const p of phrases) {
      expect(findClaims([comment("a", p)]), p).toHaveLength(0);
    }
  });

  it("ignores bots and quoted text", () => {
    const bot = { ...comment("x", "I'll take this"), user: { login: "gopherbot", type: "Bot" } };
    const quoted = comment("b", "> Can I work on this?\n\nSure, go ahead!");
    expect(findClaims([bot, quoted])).toHaveLength(0);
  });

  it("marks a claim released when the claimer gives it back", () => {
    const claims = findClaims([
      comment("a", "Can I work on this?"),
      comment("a", "I'm no longer working on this, feel free to take it."),
    ]);
    expect(claims).toHaveLength(1);
    expect(claims[0].released).toBe(true);
  });

  it("does not let someone else release a claim", () => {
    const claims = findClaims([
      comment("a", "Can I work on this?"),
      comment("b", "I'm no longer working on this"),
    ]);
    expect(claims[0].released).toBe(false);
  });

  it("flags an issue-body offer separately", () => {
    const issue = {
      user: user("reporter"),
      body: "Steps...\n\nI would be happy to submit a PR for this.",
      created_at: "2026-10-01T00:00:00Z",
      html_url: "https://github.com/o/r/issues/1",
    };
    const claims = findClaims([], issue);
    expect(claims).toHaveLength(1);
    expect(claims[0].isIssueBody).toBe(true);
  });

  it("keeps a short snippet around the claim", () => {
    const long = "Lots of context here. ".repeat(20) + "Can I work on this? " + "More text. ".repeat(20);
    const [claim] = findClaims([comment("a", long)]);
    expect(claim.snippet).toContain("Can I work on this?");
    expect(claim.snippet.length).toBeLessThanOrEqual(170);
  });
});

describe("findGerritChanges", () => {
  it("finds gopherbot CL mentions", () => {
    const c = {
      ...comment("gopherbot", "Change https://go.dev/cl/844745 mentions this issue: `_content/tour: handle PageUp`"),
      user: { login: "gopherbot", type: "User" },
    };
    expect(findGerritChanges([c])).toEqual([
      expect.objectContaining({ url: "https://go.dev/cl/844745", by: "gopherbot" }),
    ]);
  });
});

describe("findLinkedPRs", () => {
  const pr = (number, state, mergedAt = null, repo = "o/r") => ({
    event: "cross-referenced",
    source: {
      issue: {
        number,
        title: `PR ${number}`,
        html_url: `https://github.com/${repo}/pull/${number}`,
        state,
        user: user("dev"),
        repository: { full_name: repo },
        pull_request: { merged_at: mergedAt },
      },
    },
  });

  it("classifies open, merged and closed PRs", () => {
    const prs = findLinkedPRs(
      [pr(1, "open"), pr(2, "closed", "2026-10-18T16:20:36Z"), pr(3, "closed")],
      "o/r"
    );
    expect(prs.map(p => [p.number, p.state])).toEqual([
      [1, "open"],
      [2, "merged"],
      [3, "closed"],
    ]);
  });

  it("ignores issue cross-references and marks other repos as external", () => {
    const issueRef = { event: "cross-referenced", source: { issue: { number: 9, state: "open" } } };
    const prs = findLinkedPRs([issueRef, pr(4, "open", null, "fork/r")], "o/r");
    expect(prs).toHaveLength(1);
    expect(prs[0].external).toBe(true);
  });
});

describe("verdict", () => {
  const base = { issue: { state: "open", assignees: [] }, claims: [], prs: [], gerrit: [] };

  it("is free with nothing going on", () => {
    expect(verdict(base).level).toBe("free");
  });

  it("is taken with an open PR in the same repo", () => {
    const v = verdict({ ...base, prs: [{ number: 5, state: "open", external: false }] });
    expect(v).toEqual({ level: "taken", reason: "Open PR #5" });
  });

  it("ignores PRs from other repos and closed PRs", () => {
    const prs = [
      { number: 5, state: "open", external: true },
      { number: 6, state: "closed", external: false },
    ];
    expect(verdict({ ...base, prs }).level).toBe("free");
  });

  it("is taken with a Gerrit change", () => {
    expect(verdict({ ...base, gerrit: [{ url: "https://go.dev/cl/1" }] }).level).toBe("taken");
  });

  it("is maybe with an assignee or an active claim", () => {
    expect(verdict({ ...base, issue: { state: "open", assignees: [user("a")] } }).level).toBe("maybe");
    expect(verdict({ ...base, claims: [{ login: "a", released: false }] }).reason).toBe("Claimed by @a");
  });

  it("ignores released claims and offers in the issue body", () => {
    const claims = [
      { login: "a", released: true },
      { login: "r", released: false, isIssueBody: true },
    ];
    expect(verdict({ ...base, claims }).level).toBe("free");
  });

  it("is taken when the issue is closed", () => {
    expect(verdict({ ...base, issue: { state: "closed" } }).level).toBe("taken");
  });
});

describe("findMentionedPRs", () => {
  it("finds PRs that comments point to but the timeline doesn't link", () => {
    const comments = [
      comment("a", "@someone PR is already open for this, and it looks good to me: #66243"),
      comment("b", "See https://github.com/nodejs/node/pull/66100 for context"),
      comment("c", "Related to #12 and https://github.com/other/repo/pull/5"),
    ];
    const found = findMentionedPRs(comments, "nodejs/node", { issueNumber: 66349, linked: [66100] });
    expect(found.map(f => [f.number, f.by])).toEqual([[66243, "a"]]);
  });

  it("makes the verdict 'maybe'", () => {
    const v = verdict({
      issue: { state: "open", assignees: [] },
      claims: [],
      prs: [],
      gerrit: [],
      mentioned: [{ number: 66243 }],
    });
    expect(v).toEqual({ level: "maybe", reason: "PR #66243 mentioned in comments" });
  });
});
