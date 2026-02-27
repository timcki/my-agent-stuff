---
name: commit
description: "Read this skill before making git commits"
---

# Commit Message Generator

Generate a commit message for the latest changes following our project standards.

## Process

1. Run `jj diff --git -r @` to examine the exact changes in the current revset
2. Review the conversation context to understand the motivation
3. Analyze what changed and why it changed
4. Optional: if more context is needed run `jj diff --git --from 'trunk()' --to @` to get context for all changes in the current branch

## Ask Questions First

If anything is unclear, ask questions before generating the commit message:
- What was the motivation for these changes?
- What problem does this solve?
- Are there related changes in other files that provide context?
- Were there specific requirements or issues driving this work?
- Is this part of a larger feature or refactor?

Better to clarify than to write a vague commit message.

## Format Requirements

**Header (≤52 characters):**
```
<service/dir>/<package>: short summary
```
- Use lowercase
- No period at end
- Be specific about the area changed

**Body (≤72 characters per line):**
- Use full sentences OR bullet points
- If bullet points: start with `*` and lowercase first letter
- Explain WHY the changes were made, not just WHAT changed
- Include context that would help future developers understand the reasoning

## Example
```
backend/api: add rate limiting to transaction endpoints

* prevents abuse by limiting requests to 100/hour per user
* implements token bucket algorithm for smooth traffic handling
* adds redis for distributed rate limit tracking

This was needed because we saw some users hammering the API
during month-end reconciliation, causing performance issues
for other users.
```

## Co-authored-by Trailer

Always include your default Co-authored-by trailer at the end of the commit message body, separated by a blank line.

## Edit Draft Before Committing

If the `edit_proposed_text` tool is available, run it on the draft commit message:

- `purpose`: `commit message`
- `fileExtension`: `gitcommit`
- `text`: full commit message draft

Use the returned text as the final commit message.

## Sanity Check and Auto-Commit

After `edit_proposed_text` returns, do a quick sanity check for:
- typos and obvious grammar errors
- clear scope in the header
- obvious format violations (header/body length and bullet style)

If there are no obvious issues, commit immediately (no extra user
confirmation step):

```bash
jj commit -m "<message>"
```

Then report that the commit was created and include the commit id.

Only ask for confirmation instead of auto-committing when:
- the user explicitly asks to review first
- you spot issues that need clarification
- `edit_proposed_text` is unavailable or fails
