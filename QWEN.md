# Context Management Rules

Maintain project continuity across context compaction and
separate sessions.

## Project State

Keep `docs/agent/PROJECT_STATE.md` current at all times (not
just before compaction, which may happen without warning).
Update it when a task starts or finishes, a decision is made,
a bug or blocker is found, or requirements change.

It must always contain:
1. Current objective.
2. Important architectural decisions.
3. Completed work.
4. Work in progress (preserve unfinished work).
5. Outstanding tasks.
6. Known issues and blockers.
7. Important files and their purposes.

Never mark a task complete without verification.

## Session Start / After Compaction

1. Read `PROJECT_STATE.md` and review `docs/architecture/`.
2. Check `git status`, the current branch, `git worktree list`,
   and recent commits.
3. Re-establish the objective, outstanding tasks, last
   completed milestone, and next action.
4. Continue from the last verified state. Do not repeat
   completed work unless verification shows it is necessary.

## Version Control (Git)

1. Track all work in git. If not a repo: `git init -b main`.
2. Keep `main` working and buildable.
3. Commit as you go: small, logical commits whose messages say
   what changed and why.
4. Use `feature/<name>` or `fix/<name>` branches for
   non-trivial or experimental work; merge to `main` once
   verified.
5. Use `git worktree` for parallel branches or isolated
   experiments; remove worktrees once merged or abandoned.
6. Never commit build artifacts, temp files, or secrets;
   maintain `.gitignore`.
7. Never rewrite or discard history on `main`.

## Architecture Documentation

Record decisions in `docs/architecture/`, one Markdown file
per topic (e.g. `overview.md`, `interfaces.md`, `data.md`,
`build.md`, `decisions.md`). Cover what applies:
- Purpose, features, and domain rules or behavior.
- User-facing interfaces (UI flows, CLI, API, public library
  surface).
- Architecture: components, data flow, data models and
  storage, dependencies, configuration, and platform-specific
  concerns.
- Build, test, and deployment.
- Key decisions, with alternatives considered and why.

Update the docs in the same change as any code that alters
documented behavior.

## Task Completion

A task is done only when it is verified, `PROJECT_STATE.md`
and `docs/architecture/` are updated, and code and docs are
committed together on the appropriate branch.

## Memory

Save durable decisions and project-specific knowledge to
Qwen's persistent memory. Do not save temporary debugging
output or transient details.

## Long-Running Commands

Use background execution (`is_background: true`, a tool
parameter, not a shell argument) for commands expected to take
over 30 seconds, when the tool supports it: servers, watchers,
long test suites, benchmarks, polling loops, large data jobs,
and long builds. Run short commands in the foreground.

1. Check background tasks with `/tasks`. Background does not
   mean fire-and-forget: wait for completion when the result
   is needed.
2. Inspect output, errors, and exit codes before declaring
   success.
3. Never restart a stateful operation just because its
   foreground run timed out or warned.
4. For deployments, migrations, pushes, and other side-effecting
   operations, verify the original run's status before retrying.

For local AI model benchmarks or coding agent evaluations,
also follow `BENCHMARKS.md`.
