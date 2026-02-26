---
name: jj-workspaces
description: Use jujutsu workspaces (jj's equivalent to git worktrees) for parallel development with coding agents
---

# Jujutsu Workspaces

Use `jj workspace` for multiple working copies of the same repo.

## Mental model

- `jj workspace` is jj's native equivalent of `git worktree`
- each workspace has its own working-copy commit (`@`)
- in many setups, only the main workspace is colocated with `.git`
- if another workspace rewrites your working-copy commit, run `jj workspace update-stale`

## Recommended layout

Prefer workspace directories **outside** the repo root (sibling directories), for example:

```bash
jj workspace add ../repo-ws-feature-a --name feature-a -r main
jj workspace add ../repo-ws-debug --name debug -r @-
```

Using a `/.worktrees` directory inside the repo is possible, but easier to misuse (recursive tooling, search noise, accidental watcher load).

If you still use an in-repo folder, add strict ignores:

```gitignore
/.worktrees/
```

and configure IDE/test watchers to exclude it.

## Workflow

1. keep the main workspace stable for overview/sync
2. create one workspace per task
3. run coding + tests inside that workspace
4. rebase/sync as needed
5. forget + delete workspace when done

## Important commands

### Workspace lifecycle

```bash
jj workspace add <dest> [--name <name>] [-r <rev>]
jj workspace list
jj workspace root [--name <name>]
jj workspace rename <new-name>
jj workspace update-stale
jj workspace forget [<name>...]
```

### Day-to-day jj commands in a workspace

```bash
jj st
jj log
jj diff
jj show <rev>

jj new [<rev>]
jj describe -m "<message>"
jj commit -m "<message>"

jj rebase -d main
jj squash
jj split
jj abandon
jj undo
```

### Git interop (usually from main colocated workspace)

```bash
jj git fetch
jj git push --bookmark <bookmark>
jj git colocation status
```

## Agent-specific guidance

- use one agent session per workspace path when possible
- keep long-running tests in one workspace while editing in another
- if commands complain about stale working copy, run:

```bash
jj workspace update-stale
```

- if `jj git ...` fails in non-main workspaces, run it from the main colocated workspace
