# Project notes for Claude

## Git / PR workflow

PRs in this repo are **squash-merged** (see #60–64). A squash merge puts the
branch's combined diff onto `main` as a single new commit with a *new* SHA and
**no ancestry link** to the branch's commits.

**After every merge, realign the working branch to `main` before doing more work:**

```
git fetch origin main
git reset --hard origin/main        # branch == main; nothing lost, work is already merged
git push --force-with-lease origin <branch>   # only if the remote branch still has the old commits
```

Why this matters: if you keep committing on the same branch *without* realigning,
the next PR's merge-base is the pre-squash commit. Git then sees both `main` (via
the squash) and the branch (via its original commits) as having changed the same
files, producing a **phantom merge conflict** even when the content agrees. The
fix is to realign — not to repeatedly rebase/`reset --soft` at merge time.

Equivalent alternatives: cut a fresh branch from `main` for each batch, or switch
to regular merge commits (preserves history but clutters `main`).

## Scores

Engraved sheet music lives in `tools/scores/*.ly` (absolute octaves) and builds to
`scores/<piece>/*.svg` via `tools/scores/build_scores.py`. See the `score-workflow`
skill in `.claude/skills/` for the full process.
