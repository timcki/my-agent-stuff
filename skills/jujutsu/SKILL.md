---
name: jujutsu
description: Use jujutsu (jj) for version control instead of git
---

# Jujutsu Version Control

This project uses jujutsu (jj) instead of git. Always use `jj` commands.

## Key commands

- `jj status` - show working copy status
- `jj log` - show commit history (default is nice graph view)
- `jj diff` - show changes
- `jj new` - create new empty commit on top of current
- `jj commit -m "msg"` - commit with message
- `jj describe -m "msg"` - update current commit message
- `jj squash` - squash into parent
- `jj edit @-` - edit parent commit
- `jj rebase -d main` - rebase onto main
- `jj git push` - push to remote
- `jj git fetch` - fetch from remote

## Workflow

1. `jj new` to start working
2. Make changes (auto-tracked, no staging)
3. **Before committing: read the `commit` skill for message format and confirmation requirements**
4. `jj commit -m "msg"` or `jj describe` + `jj new`

## Notes

- No staging area - all changes auto-tracked
- Working copy is always a commit
- Use `jj abandon` to discard current changes
- `@` means current commit, `@-` means parent
- Conflicts are first-class: `jj resolve` to fix
- `jj undo` undoes last operation
