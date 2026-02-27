---
name: edit-draft
description: "Open draft text in an external editor with guaranteed prefill"
---

# Edit Draft

Use this skill when we need to refine a draft in an external editor (commit message, PR title/body, release notes, comments, etc.).

## Goal

Always open the editor with the intended text preloaded, then use the edited result as the final draft.

## Process

1. Build or collect the draft text first.
   - If text was already drafted in chat, use that draft.
   - If user says "edit current input", use the current editor buffer.

2. Run `edit_proposed_text` (if available) with:
   - `text`: full draft text
   - `purpose`: short label (e.g. `commit message`, `PR title`, `PR description`)
   - `fileExtension`: pick a suitable extension (`gitcommit`, `md`, `txt`)

3. Use the returned text as the new draft verbatim.

4. Show the updated draft to the user and ask for confirmation before any publishing action (commit/PR/comment/issue).

## Fallback behavior

If `edit_proposed_text` is unavailable, keep the draft in chat and ask the user for inline edits.

If the draft text is empty, do **not** open the editor yet; ask what content should be used as prefill first.

## Quick call templates

### Commit message
- `purpose`: `commit message`
- `fileExtension`: `gitcommit`

### PR title
- `purpose`: `PR title`
- `fileExtension`: `txt`

### PR body
- `purpose`: `PR description`
- `fileExtension`: `md`
