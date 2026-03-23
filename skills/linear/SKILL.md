---
name: linear
description: "Interact with Linear issues for TokenTax (browse, view, create, update, comment). Read this before any Linear operation or when starting work on an issue."
---

# Linear CLI Skill

Use the `linear` CLI (schpet/linear-cli) to interact with TokenTax's Linear workspace.

## Teams

| Key | Name         | Repos                              |
|-----|--------------|------------------------------------|
| INT | Integrations | `exchange-service-2`               |
| TOK | Tokentax     | `api-v2`, general product work     |

Pick the team based on the repo you're working in. Default to `INT` when in `exchange-service-2`, `TOK` when in `api-v2`.

## Starting Work on an Issue

When the user asks you to work on a Linear issue (e.g. "pick up INT-3542"), follow these steps:

### 1. Read the issue

```bash
linear issue view INT-3542 --no-pager
```

Understand the full context — description, labels, parent issues, comments. Use `--json` if you need to parse details programmatically.

### 2. Pull latest main

Always pull before creating a workspace:

```bash
jj git fetch
```

### 3. Create a jj workspace

Use the **jj-workspaces** skill. Create a workspace based on `main` (unless the issue specifically says to branch off something else):

```bash
jj workspace add ../exchange-service-2-ws-INT-3542 --name INT-3542 -r main
cd ../exchange-service-2-ws-INT-3542
```

Naming convention: `<repo>-ws-<issue-id>`.

### 4. Install dependencies in the new workspace

```bash
yarn install
```

### 5. Start working

You're now on a fresh working copy based on latest `main`. Make changes, run tests, iterate.

### 6. Commits

When committing, include the Linear trailer from `linear issue describe`:

```bash
linear issue describe INT-3542
# → Linear-issue: Fixes INT-3542
```

Add this trailer to your commit messages (see the `commit` skill for full format).

## Common Commands

### List issues

```bash
# My open issues (current cycle)
linear issue list --sort priority --team INT --cycle active

# All open issues for the team
linear issue list --sort priority --team INT -A

# Filter by state
linear issue list --sort priority --team INT --state started
linear issue list --sort priority --team INT --state unstarted

# States: triage, backlog, unstarted, started, completed, canceled
# Use --all-states to see everything
```

### View an issue

```bash
linear issue view INT-3542              # human-readable
linear issue view INT-3542 --json       # JSON (for parsing)
```

### Create an issue

```bash
linear issue create --team INT \
  --title "short description" \
  --description "Detailed context" \
  --priority 2 \
  --label "blockscout v3" \
  --state "Todo" \
  --assignee self \
  --no-interactive
```

Priority: 1 (urgent) → 4 (low). Use `--no-interactive` to avoid prompts.

### Update an issue

```bash
linear issue update INT-3542 --state "In Progress"
linear issue update INT-3542 --assignee self
linear issue update INT-3542 --cycle active
```

### Comments

```bash
linear issue comment add INT-3542 --body "comment text"
linear issue comment list INT-3542
```

## CLI Tips

- **`--sort priority`** is required for `list` — there's no default.
- Always pass `--team` — the CLI can't infer it from directory names like `exchange-service-2`.
- Use `--no-pager` when piping output or in non-interactive contexts.

## CRITICAL Reminders

- **Never post comments, create issues, or update issues without asking the user first.** Show the proposed content and ask "Should I proceed?"
- When referencing a Linear issue in commits, use the `Linear-issue: Fixes INT-XXXX` trailer format (from `linear issue describe`).
