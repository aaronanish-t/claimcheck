import { describe, expect, it } from "vitest";
import { findClaims, verdict } from "../src/lib/claims.js";

const user = login => ({ login, type: "User" });
const say = (body, login = "dev") => ({
  user: user(login),
  body,
  created_at: "2026-11-01T00:00:00Z",
  html_url: "https://github.com/o/r/issues/1#issuecomment-1",
});
const claims = (...bodies) => findClaims(bodies.map((b, i) => say(b, `dev${i}`)));
const isClaim = body => claims(body).length === 1;

// What a claim looks like when real people write it: first-timers, students,
// regulars, terse bot-style commands, and smart quotes from phones and Macs.
const CLAIMS = {
  "direct offers": [
    "I'd like to work on this.",
    "I would like to work on this issue.",
    "I want to work on this!",
    "I'd love to take this on.",
    "Happy to take this on.",
    "Happy to work on this if no one else is.",
    "I'd be glad to fix this.",
    "I can take this one.",
    "I can fix this.",
    "I'll work on this.",
    "I'll take this.",
    "I will submit a PR for this.",
    "I'll send a PR shortly.",
  ],
  "requests to be assigned": [
    "Can I work on this?",
    "Could I take this?",
    "May I be assigned to this issue?",
    "Could you assign this to me?",
    "Please assign this issue to me.",
    "Can you assign me this one?",
    "Mind if I pick this up?",
    "Is this still available?",
    "Is this issue open for contribution?",
    "Is anyone working on this? If not, I'd like to try.",
  ],
  "in progress": [
    "I'm working on this.",
    "I'm currently working on a fix.",
    "I'm still working on this, it's my first contribution so it's taking a while.",
    "Working on it!",
    "On it.",
    "I'm on it.",
    "I've started working on this.",
    "I've opened a PR for this.",
    "I have a fix ready for this. Could you assign the issue to me so I can open the PR?",
    "I was able to reproduce this and implemented a local fix.",
    "Would the maintainers be open to a pull request for this fix?",
  ],
  "newcomers and students": [
    "Hi! I'm new to open source and would love to contribute a fix for this issue.",
    "Hello, I'm a student and I'd like to work on this as my first issue.",
    "I'd love to contribute to this issue, can you point me to where to start?",
    "Hey, I'd like to give this a shot.",
    "I'll give this a try.",
  ],
  "phrasings seen on real issues": [
    "Can we please backport this to v2? If yes, can I share PR?",
    "I'd like to investigate this on current main and prepare a focused fix with regression coverage.",
    "Lets goo. You mind if I PR this?",
    "Hi! I'd like to investigate this issue and contribute a fix.",
    "I’m going to reproduce this on current main and fix the optimizer bookkeeping.",
    "I'm going to work on this over the weekend.",
    "Hi! I'm interested in contributing the callback-ref example to the docs.",
    "I'm interested in working on adding that.",
    "Sup! I'm new to this. Could I try on this one?",
    "They already generated one. Can I submit my own?",
    "Hey, I can try and handle this issue. New to contribution.",
    "Yes, I'll prepare a pull request.",
    "I'd be happy to contribute one if you think it helps.",
    "I can write another PR with a workflow to do that.",
    "Hi maintainers, I have prepared a complete fix with tests. Could you please assign this issue to me?",
    "If not, I can take it on and open one with a regression test included.",
    "Follow up from the call: I will work on adding a section covering numpy.block.",
    "I'll take DateOffset, BaseOffset and Tick.",
    "Hi! I've read the issue and the earlier attempt, and I'll give it a go.",
  ],
  "commands": ["/assign", "/assign me", "/take", "/claim", ".take", "take"],
  "smart quotes": [
    "I’d like to work on this.",
    "I’m working on this.",
    "I’ll take this.",
    "Happy to take this on, I’ve got a fix ready.",
    "I‘d like to work on this.",
  ],
  "formatting": [
    "**I'd like to work on this.**",
    "> not a quote of someone else\n\nI'd like to work on this.",
    "Hi @maintainer,\r\n\r\nI'd like to work on this issue.\r\n\r\nThanks!",
    "I'D LIKE TO WORK ON THIS",
    "i'd like to work on this",
    "I'd like to work on this 🙂",
    "Hey!! can i work on this??",
  ],
};

// Comments that mention working, taking or fixing without claiming the issue.
const NOT_CLAIMS = {
  "reproductions and reports": [
    "I can reproduce this on Windows 11.",
    "This is working on my machine with 0.17.0.",
    "I'm working on Windows and see the same error.",
    "I'm working on a different project that hits this.",
    "I'm working with the latest nightly and it still fails.",
    "Is this still happening on the latest release?",
    "Is this still an issue?",
    "Is this still broken for you?",
    "Same here, can confirm on macOS.",
    "I can't take credit for the workaround, it came from the docs.",
  ],
  "maintainers inviting or assigning": [
    "PRs welcome!",
    "We'd be happy to take a PR for this.",
    "Feel free to work on this.",
    "Contributions are welcome, go ahead and open a PR.",
    "We'd be open to a pull request for this.",
    "Assigning this to you.",
    "I'll assign this to you, thanks!",
    "Go for it, I've assigned you.",
    "Marking this as good first issue.",
  ],
  "everyday phrases that look similar": [
    "I'll take a look at the logs and report back.",
    "I'll take a closer look tomorrow.",
    "I'll try that and let you know.",
    "I'll test this on Linux.",
    "I'll fix my typo in the title.",
    "I will update the issue description.",
    "I'll look into it.",
    "Thanks, that fixed it for me.",
    "I'd like to see this documented.",
    "I'd like to know what the expected behaviour is.",
    "I'd love to see this fixed!",
    "Can I ask what version you're on?",
    "Can I get a stack trace?",
    "Could you take a screenshot?",
    "Can you work around it by pinning the version?",
  ],
  "look-alikes seen on real issues": [
    "I'm going to bed now.",
    "I'm going to need the full log to say more.",
    "I'm going to assume this is a bug in the plugin.",
    "I'm interested in the roadmap for this.",
    "I'm interested in knowing whether this is fixed in 1.10.",
    "Can I try the nightly build?",
    "Can I try it on Windows?",
    "I can write a script to reproduce this.",
    "I'll prepare the release notes.",
    "If you open a PR with your proposed fix, I can take a look.",
    "Feel free to make a PR.",
    "I'm happy for you to open the PR.",
    "Are you interested in writing the PR?",
    "I'll take your word for it.",
    "I'll take care of the release.",
    "I'll work on my laptop tonight and report back.",
    "Is this still being worked on?",
    "I'm not actively working on a PR for this, it's theirs to take first.",
  ],
  "quoted or embedded text": [
    "> I'd like to work on this.\n\nAre you still on it?",
    "```\nI'd like to work on this\n```",
    "The template says: `I'm working on this`",
  ],
  "empty": ["", "   ", "\n\n", "👍", "+1"],
};

describe("claims people write", () => {
  for (const [group, phrases] of Object.entries(CLAIMS)) {
    describe(group, () => {
      it.each(phrases)("detects %j", phrase => {
        expect(isClaim(phrase)).toBe(true);
      });
    });
  }
});

describe("comments that are not claims", () => {
  for (const [group, phrases] of Object.entries(NOT_CLAIMS)) {
    describe(group, () => {
      it.each(phrases)("ignores %j", phrase => {
        expect(isClaim(phrase)).toBe(false);
      });
    });
  }
});

describe("who is speaking", () => {
  it("ignores bots", () => {
    const bot = { user: { login: "stale[bot]", type: "Bot" }, body: "I'd like to work on this." };
    expect(findClaims([bot])).toHaveLength(0);
  });
  it("ignores deleted users", () => {
    expect(findClaims([{ user: null, body: "I'm working on this." }])).toHaveLength(0);
  });
  it("counts each person's first claim once", () => {
    const found = findClaims([say("I'd like to work on this."), say("I'm working on this now.")]);
    expect(found).toHaveLength(2);
    expect(new Set(found.map(c => c.login)).size).toBe(1);
  });
});

describe("giving an issue back", () => {
  const released = (...bodies) =>
    findClaims(bodies.map(b => say(b, "me")))[0]?.released;
  it.each([
    "I'm no longer working on this.",
    "I am no longer able to work on this, sorry.",
    "Unassigning myself, someone else can take it.",
    "Feel free to take over this one.",
    "I won't be able to finish this, anyone is welcome to pick it up.",
    "Sorry, I don't have time for this anymore. Feel free to take it.",
    "I’m no longer working on this.",
  ])("releases on %j", release => {
    expect(released("I'd like to work on this.", release)).toBe(true);
  });
  it("does not release on an unrelated later comment", () => {
    expect(released("I'd like to work on this.", "Pushed a fix to the branch.")).toBe(false);
  });
  it("does not let another person release your claim", () => {
    const found = findClaims([
      say("I'd like to work on this.", "alice"),
      say("I'm no longer working on this.", "bob"),
    ]);
    expect(found[0].released).toBe(false);
  });
});

describe("robustness", () => {
  it("handles missing bodies", () => {
    expect(() => findClaims([{ user: user("a"), body: null }, { user: user("b") }])).not.toThrow();
  });
  it("stays fast on very long comments (no regex blow-up)", () => {
    const long = "I'd like to " + "work ".repeat(40000) + "on";
    const noisy = ("I'm working " + "on ".repeat(30) + "\n").repeat(5000);
    const start = performance.now();
    findClaims([say(long), say(noisy), say("a".repeat(300000))]);
    expect(performance.now() - start).toBeLessThan(1500);
  });
  it("keeps the snippet short", () => {
    const [c] = findClaims([say("x ".repeat(500) + "I'd like to work on this. " + "y ".repeat(500))]);
    expect(c.snippet.length).toBeLessThanOrEqual(170);
  });
});

describe("the verdict users rely on", () => {
  const open = { state: "open", assignees: [] };
  const base = { issue: open, claims: [], prs: [], gerrit: [], mentioned: [] };
  const claim = (extra = {}) => ({ login: "a", released: false, isIssueBody: false, ...extra });
  it("is free with nothing on the issue", () => {
    expect(verdict(base).level).toBe("free");
  });
  it("is maybe when someone claimed", () => {
    expect(verdict({ ...base, claims: [claim()] }).level).toBe("maybe");
  });
  it("is free again when the claim was released", () => {
    expect(verdict({ ...base, claims: [claim({ released: true })] }).level).toBe("free");
  });
  it("does not count the issue author's own offer in the body", () => {
    expect(verdict({ ...base, claims: [claim({ isIssueBody: true })] }).level).toBe("free");
  });
  it("is maybe when assigned", () => {
    expect(verdict({ ...base, issue: { ...open, assignees: [{ login: "a" }] } }).level).toBe("maybe");
  });
  it("is taken with an open PR, even if the claim was released", () => {
    const prs = [{ number: 5, state: "open", external: false }];
    expect(verdict({ ...base, prs, claims: [claim({ released: true })] }).level).toBe("taken");
  });
  it("is taken when the issue is closed", () => {
    expect(verdict({ ...base, issue: { state: "closed", assignees: [] } }).level).toBe("taken");
  });
  it("is free when the only PR was closed without merging", () => {
    const prs = [{ number: 5, state: "closed", external: false }];
    expect(verdict({ ...base, prs }).level).toBe("free");
  });
  it("ignores PRs from other repositories", () => {
    const prs = [{ number: 5, state: "open", external: true }];
    expect(verdict({ ...base, prs }).level).toBe("free");
  });
});
