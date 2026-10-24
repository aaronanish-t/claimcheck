# ClaimCheck

**Is this GitHub issue already taken, and what does the repo allow?** ClaimCheck answers both on the issue page, before you spend an evening on a fix nobody can merge.

<!-- TODO: screenshot / GIF of the panel on a real issue -->

It adds a small panel to every GitHub issue:

- **A verdict:** 🟢 looks free, 🟡 possibly claimed, or 🔴 taken.
- **Linked pull requests** from the issue timeline (open, merged, or closed without merging), plus PRs that comments point to but the timeline doesn't link ("a PR is already open for this: #123").
- **Claims** like "I'd like to work on this" or "can I take this?", with a link to each comment. Claims the person later gave back are shown struck through.
- **Gerrit changes** (Go, and other googlesource projects), where fixes happen outside GitHub.
- **The repo's contribution rules** from `AI_POLICY.md`, `AGENTS.md`, `CONTRIBUTING.md`, the PR template and the org-wide `.github` repo, including AI policies they link to. It flags things like:
  - outside PRs restricted (approved contributors only, or PRs paused)
  - AI-generated contributions banned
  - limits on AI agents
  - comments and PR text must be in your own words
  - AI use must be disclosed
  - no AI on good first issues
  - discuss in an issue first, or sign a CLA

Every policy flag quotes the sentence it came from and links the file. The detection is keyword-based, so treat it as a pointer to the right paragraph, not a ruling.

## Why

Contributing to busy projects fails in boring ways: someone already has a PR open, a fix is in review on Gerrit, the repo only takes PRs from approved contributors, or it bans AI-written comments. All of that is written down somewhere, just never on the issue page. ClaimCheck puts it there.

## Install

The extension isn't in the stores yet. To try it:

```bash
npm install
npm run build
```

- **Chrome / Edge:** open `chrome://extensions`, turn on Developer mode, click **Load unpacked**, and pick the `dist` folder.
- **Firefox:** open `about:debugging#/runtime/this-firefox`, click **Load Temporary Add-on**, and pick `dist/manifest.json`.

### GitHub token (optional)

Without a token, GitHub allows 60 API requests an hour **per IP address**, shared with everyone on your network (each issue uses about 3). On a campus or office network that runs out fast. Add a [fine-grained token](https://github.com/settings/personal-access-tokens/new) in the extension's options: no permissions beyond read-only access to public repositories are needed. It's kept in the browser's extension storage and only sent to `api.github.com`.

Policy files are read from `raw.githubusercontent.com`, which doesn't count against the limit, so the policy section works even when the API limit is used up.

## Privacy

ClaimCheck runs only on `github.com/*/*/issues/*` pages and only talks to `api.github.com` and `raw.githubusercontent.com`. There's no analytics and no server of its own. Policy results are cached locally for a day.

## Development

```bash
npm test          # unit tests (vitest)
npm run watch     # rebuild dist/ on change
npm run package   # build and zip for the stores
```

`dev/index.html` renders the panel outside the extension, against the live API or against snapshots saved with `node scripts/fetch-fixture.mjs owner/repo/issues/123` (which uses your `gh` CLI login). Serve the repo root with any static server, for example `python -m http.server`, and open `/dev/index.html?issue=owner/repo/issues/123`.

The logic lives in `src/lib/claims.js` (claims, PRs, verdict) and `src/lib/policy.js` (policy rules). Most improvements are a new pattern plus a test: if ClaimCheck misreads a repo, please open an issue with the link.

## License

MIT
