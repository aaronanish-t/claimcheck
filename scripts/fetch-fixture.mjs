// Saves a real issue's API data (issue, comments, timeline) to dev/fixtures/
// using the GitHub CLI's own login, so the dev harness can render it without
// spending the browser's unauthenticated rate limit.
// Usage: node scripts/fetch-fixture.mjs owner/repo/issues/123 [...]
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";

function gh(path) {
  const out = execFileSync("gh", ["api", "--paginate", "--slurp", path], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  const pages = JSON.parse(out);
  return Array.isArray(pages[0]) ? pages.flat() : pages[0];
}

mkdirSync("dev/fixtures", { recursive: true });
for (const arg of process.argv.slice(2)) {
  const m = /([^/]+)\/([^/]+)\/issues\/(\d+)/.exec(arg);
  if (!m) {
    console.error(`Skipping ${arg}: not owner/repo/issues/N`);
    continue;
  }
  const [, owner, repo, number] = m;
  const base = `repos/${owner}/${repo}/issues/${number}`;
  const data = {
    issue: gh(base),
    comments: gh(`${base}/comments?per_page=100`),
    timeline: gh(`${base}/timeline?per_page=100`),
  };
  const file = `dev/fixtures/${owner}__${repo}__${number}.json`;
  writeFileSync(file, JSON.stringify(data));
  console.log(`Wrote ${file} (${data.comments.length} comments, ${data.timeline.length} events)`);
}
