import { describe, expect, it } from "vitest";
import {
  classifyPolicy,
  findLinkedPolicies,
  mergeFlags,
  toSentences,
} from "../src/lib/policy.js";

const ids = md => classifyPolicy(md, "https://example.test/CONTRIBUTING.md").map(f => f.id);

describe("toSentences", () => {
  it("strips markdown links and splits list items and sentences", () => {
    const s = toSentences("Read the [guide](https://x).\n\n- First item. Second sentence.\n- **Bold** item");
    expect(s).toEqual(["Read the guide.", "First item.", "Second sentence.", "Bold item"]);
  });
});

describe("classifyPolicy", () => {
  it("detects 'own words' and agent rules (Astral-style)", () => {
    const md = `We support using AI as tools for coding.
AI should not be used to generate comments when communicating with maintainers.
If you are opening a pull request, we expect you to be able to explain the proposed changes in your own words.
We do not allow autonomous agents to be used for contributing to our projects.`;
    expect(ids(md)).toEqual(expect.arrayContaining(["own-words", "no-agents", "ai-ok"]));
    expect(ids(md)).not.toContain("ai-banned");
  });

  it("detects disclosure and good-first-issue rules (Node-style)", () => {
    const md = `The project does not prohibit the use of AI tools in contributions, but when the contribution is generated with AI, the contributor should disclose the use of such tools.
It's prohibited to use AI to automate fixes to issues marked as "good first issue".
Pull requests must not be opened by automated tooling, unless specifically approved in advance by the project.`;
    expect(ids(md)).toEqual(expect.arrayContaining(["disclose", "gfi-no-ai", "no-agents"]));
  });

  it("detects restricted outside PRs", () => {
    expect(ids("We are not currently accepting pull requests from outside the team.")).toContain("no-outside-prs");
    expect(ids("Pull requests are temporarily paused while we restructure.")).toContain("no-outside-prs");
    expect(ids("We only accept pull requests from approved contributors.")).toContain("no-outside-prs");
  });

  it("detects outright AI bans", () => {
    expect(ids("AI-generated contributions will not be accepted.")).toContain("ai-banned");
    expect(ids("Please do not submit code written with ChatGPT or Copilot.")).toContain("ai-banned");
  });

  it("detects issue-first and CLA requirements", () => {
    expect(ids("Please open an issue first to discuss larger changes.")).toContain("issue-first");
    expect(ids("You must sign the CLA before we can merge.")).toContain("cla");
  });

  it("does not flag a plain contributing guide", () => {
    const md = `# Contributing
Run npm install, then npm test. Use conventional commits. Thanks for helping!`;
    expect(ids(md)).toEqual([]);
  });

  it("returns the matching sentence as the quote", () => {
    const [flag] = classifyPolicy("Intro text. AI-generated code will be rejected. Outro.", "src");
    expect(flag.quote).toBe("AI-generated code will be rejected.");
    expect(flag.source).toBe("src");
  });
});

describe("mergeFlags", () => {
  it("keeps the first flag per rule, sorted by severity, and drops ai-ok next to a ban", () => {
    const merged = mergeFlags([
      [{ id: "disclose", severity: "medium", source: "a" }],
      [
        { id: "disclose", severity: "medium", source: "b" },
        { id: "ai-banned", severity: "high", source: "b" },
        { id: "ai-ok", severity: "info", source: "b" },
      ],
    ]);
    expect(merged.map(f => [f.id, f.source])).toEqual([
      ["ai-banned", "b"],
      ["disclose", "a"],
    ]);
  });
});

describe("findLinkedPolicies", () => {
  it("resolves relative and absolute links to AI policy docs", () => {
    const md = `See [details](./doc/contributing/ai-guidelines.md) and
[org policy](https://github.com/astral-sh/.github/blob/main/AI_POLICY.md) and [other](./docs/setup.md).`;
    expect(findLinkedPolicies(md, { owner: "nodejs", repo: "node" })).toEqual([
      { owner: "nodejs", repo: "node", path: "doc/contributing/ai-guidelines.md" },
      { owner: "astral-sh", repo: ".github", path: "AI_POLICY.md" },
    ]);
  });

  it("resolves links relative to the doc's directory", () => {
    const md = "[AI policy](../AI_POLICY.md)";
    expect(findLinkedPolicies(md, { owner: "o", repo: "r", dir: ".github" })).toEqual([
      { owner: "o", repo: "r", path: "AI_POLICY.md" },
    ]);
  });
});

describe("PR templates", () => {
  it("reads guidance inside HTML comments", () => {
    const md = `### Description

<!--
Also consider including the following:
- A disclosure of which parts of the contribution include AI generated code
-->

Description of the proposed change...`;
    expect(ids(md)).toContain("disclose");
  });
});

describe("tricky wording", () => {
  it("does not read 'does not prohibit AI' as a ban", () => {
    const md = "The project does not prohibit the use of AI tools in contributions, but contributors should disclose the use of such tools.";
    expect(ids(md)).not.toContain("ai-banned");
    expect(ids(md)).toEqual(expect.arrayContaining(["ai-ok", "disclose"]));
  });

  it("detects an approved-contributors PR policy (vitest-style)", () => {
    const md = "The team accepts pull requests from members of the team, from anyone who contributed before, from approved contributors, and for open issues with the approved label. Any other pull request is closed automatically as soon as it is opened.";
    expect(ids(md)).toContain("no-outside-prs");
  });

  it("detects 'own voice' and agent approval rules", () => {
    expect(ids("All comments should be written in your own voice.")).toContain("own-words");
    expect(ids("You cannot create a pull request, issue or leave a comment without a manual approval of your operator.")).toContain("no-agents");
  });
});
