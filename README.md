# qwen-code-generic-starter-project

Generic starter template for agent-driven (Qwen Code) projects.

## Layout
- `QWEN.md` — rules the agent follows (state tracking, git, docs).
- `docs/agent/PROJECT_STATE.md` — live project state.
- `docs/architecture/` — architecture and decision docs.
- `docs/images/` — diagrams/screenshots.
- `src/`, `tests/`, `scripts/` — code, tests, helper scripts.

## Starting a new project
```sh
gh repo create my-new-project --private --template kireol/qwen-code-generic-starter-project --clone
```
Then fill in `docs/agent/PROJECT_STATE.md` and replace this README.
