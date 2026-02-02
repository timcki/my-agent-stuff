---
name: review-pr
description: "Review a GitHub PR: checkout, analyze changes, check for consistency issues, and submit feedback"
---

# PR Review Skill

Review a GitHub pull request thoroughly using the `gh` CLI.

## Process

1. **Checkout the PR**
   ```bash
   gh pr checkout <pr-number>
   ```

2. **Get PR metadata**
   ```bash
   gh pr view <pr-number> --json title,body,author,state,additions,deletions,changedFiles,files
   ```

3. **View the diff**
   ```bash
   gh pr diff <pr-number>
   ```

4. **Read context around changes**
   - Use `read` tool to examine surrounding code (±30 lines)
   - Understand the full context of modified functions/methods

5. **Check for consistency issues**
   - Search for similar patterns elsewhere in the codebase that might need the same fix
   - Use `rg` to find related code that could be affected
   - Ask: "If this problem exists here, could it exist elsewhere?"

6. **Check CI status**
   ```bash
   gh pr checks <pr-number>
   ```

## Submitting Feedback

**Always show the comment/review text to the user first and ask for confirmation before submitting.**

**Add a comment:**
```bash
gh pr review <pr-number> --comment --body "comment text"
```

**Request changes:**
```bash
gh pr review <pr-number> --request-changes --body "explanation"
```

**Approve:**
```bash
gh pr review <pr-number> --approve --body "optional comment"
```

## Adding Line-Specific Comments via API

For comments on specific lines (not supported by `gh pr review`), use `gh api` directly:

**Single line comment:**
```bash
gh api repos/{owner}/{repo}/pulls/{pr-number}/comments \
  -f body="Your comment here" \
  -f path="path/to/file.ts" \
  -f commit_id="$(gh pr view <pr-number> --json headRefOid -q .headRefOid)" \
  -F line=42 \
  -f side="RIGHT"
```

**Multi-line comment (highlight a range):**
```bash
gh api repos/{owner}/{repo}/pulls/{pr-number}/comments \
  -f body="Your comment here" \
  -f path="path/to/file.ts" \
  -f commit_id="$(gh pr view <pr-number> --json headRefOid -q .headRefOid)" \
  -F start_line=40 \
  -F line=45 \
  -f start_side="RIGHT" \
  -f side="RIGHT"
```

**Parameters:**
- `path`: file path relative to repo root
- `line`: the line number in the diff to comment on
- `side`: `RIGHT` for additions (new code), `LEFT` for deletions (old code)
- `start_line`/`start_side`: for multi-line comments, the starting line

**Get owner/repo from current directory:**
```bash
gh repo view --json owner,name -q '"\(.owner.login)/\(.name)"'
```

## Writing Style

Use a conversational, collaborative tone:
- Use "we" instead of "you" — it's a team effort
- Ask questions rather than making demands
- Present alternatives and discuss tradeoffs
- Tag relevant people for discussion when appropriate
- Be concise but thorough

### Example: Inline comment suggesting a fix

    Both `name` and `symbol` come from on-chain data. If `symbol` can contain `\0`, couldn't `name` also have this problem? Maybe we should consider this:

    ```ts
    tokenName: name?.includes("\0") ? null : name,
    tokenSymbol: symbol?.includes("\0") ? null : symbol,
    ```

    Second thing; instead of setting to null, maybe we should strip the null bytes:

    ```ts
    tokenSymbol: symbol?.replace(/\0/g, ""),
    ```

    This preserves at least some data. On the other hand setting `null` is probably safer because malformed data is way worse than no data. Thoughts @shortcircuit3?

### Example: Request changes review

    The fix looks good for ERC721 tokens, but I think the same issue could affect ERC20 tokens in getTokenDetails() (~line 384); tokenSymbol and tokenName are also set without null byte checks.

    Should we also apply this protection there? On-chain ERC20 metadata could theoretically contain the same malformed data.

## Review Checklist

- [ ] Does the fix address the stated problem?
- [ ] Are there similar patterns elsewhere that need the same fix?
- [ ] Are related fields/variables also affected? (e.g., if `symbol` needs protection, does `name`?)
- [ ] Is the approach consistent with existing code style?
- [ ] Are there alternative approaches worth discussing?
- [ ] Do tests pass? Are new tests needed?
