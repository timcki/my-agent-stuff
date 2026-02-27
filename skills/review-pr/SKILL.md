---
name: review-pr
description: "Review a GitHub PR: checkout, analyze changes, check for consistency issues, and submit feedback"
---

# PR Review Skill

Review a GitHub pull request thoroughly using the `gh` CLI.

## Process

1. **Save any working copy changes before checkout**
   ```bash
   jj diff
   ```
   If there are any uncommitted changes, commit them first:
   ```bash
   jj commit -m "wip: <short description of the changes>"
   ```

2. **Checkout the PR**
   ```bash
   gh pr checkout <pr-number>
   ```

3. **Get PR metadata**
   ```bash
   gh pr view <pr-number> --json title,body,author,state,additions,deletions,changedFiles,files
   ```

4. **View the diff**
   ```bash
   gh pr diff <pr-number>
   ```

5. **Read context around changes**
   - Use `read` tool to examine surrounding code (±30 lines)
   - Understand the full context of modified functions/methods

6. **Check for consistency issues**
   - Search for similar patterns elsewhere in the codebase that might need the same fix
   - Use `rg` to find related code that could be affected
   - Ask: "If this problem exists here, could it exist elsewhere?"

7. **Check CI status**
   ```bash
   gh pr checks <pr-number>
   ```

## Submitting Feedback

### Iterating on comments with the user

Don't submit all feedback at once. Present each inline comment one by one:

1. Show the draft comment with the target file and line
2. If `edit_proposed_text` is available, open the comment in the editor (`purpose: review comment`, `fileExtension: md`) so the user can refine wording
3. If not available, wait for the user to approve or suggest tweaks inline
4. Move to the next comment
5. Once all comments are finalized, draft the top-level review message and open it in `edit_proposed_text` (`purpose: review summary`, `fileExtension: md`) if available
6. Ask the user for **review type**: `COMMENT`, `REQUEST_CHANGES`, or `APPROVE`
7. Submit the review only after both message and type are confirmed

This ensures the user has full control over tone, content, and review type before anything is posted.

### Submitting a review with inline comments via API

Use `gh api` to submit a single review with all inline comments at once. This is preferred over `gh pr review` which doesn't support line-specific comments.

**Get owner/repo:**
```bash
gh repo view --json owner,name -q '"\(.owner.login)/\(.name)"'
```

**Submit review with inline comments:**
```bash
gh api repos/{owner}/{repo}/pulls/{pr-number}/reviews \
  --input - <<'EOF'
{
  "event": "REQUEST_CHANGES",
  "body": "Top-level review summary here.",
  "comments": [
    {
      "path": "path/to/file.ts",
      "line": 42,
      "side": "RIGHT",
      "body": "Your comment here"
    },
    {
      "path": "path/to/other-file.ts",
      "line": 100,
      "side": "RIGHT",
      "body": "Another comment"
    }
  ]
}
EOF
```

**Event types:** `REQUEST_CHANGES`, `APPROVE`, `COMMENT`

**Comment parameters:**
- `path`: file path relative to repo root
- `line`: the line number in the diff to comment on
- `side`: `RIGHT` for additions (new code), `LEFT` for deletions (old code)
- `start_line`/`start_side`: optional, for multi-line comments

**Simple reviews without inline comments:**
```bash
gh pr review <pr-number> --comment --body "comment text"
gh pr review <pr-number> --request-changes --body "explanation"
gh pr review <pr-number> --approve --body "optional comment"
```

## Writing Style

Use a conversational, collaborative tone:
- Use "we" instead of "you" — it's a team effort
- Ask questions rather than making demands
- Present alternatives and discuss tradeoffs
- Tag relevant people for discussion when appropriate
- Be concise — avoid verbose or cringy headers like "DRY it up" or "Key Observations"

### Formatting bullet points

Use a short intro sentence, then simple bullet points:
- start with lowercase
- no period at the end
- keep each point to one or two sentences

### Example: Concise review comment

    The bytes32 fallback approach is solid. A couple things:

    - since both `name` and `symbol` need this fallback, a shared helper would be cleaner:

    ```ts
    private async readStringOrBytes32(
      tokenAddress: `0x${string}`,
      functionName: "name" | "symbol"
    ): Promise<string | undefined> {
      // try string first, fallback to bytes32
    }
    ```

    - `name` needs the same fix — MKR returns bytes32 for both `name()` and `symbol()`
    - `getERC721TokenDetails` (line 667-689) has the same pattern and could benefit from this helper

### Example: Review with observations

    Looks good! QuickNode's collection API as a fallback is a good approach. Couple questions:

    - the burn detection checks `from === userAddress && to === nullAddress`, so this only triggers when the user themselves burns the NFT — is that intentional?
    - `getERC1155TokenDetails` has similar failure modes when `uri()` reverts on a burned token

### Example: Inline comment suggesting a fix

    Both `name` and `symbol` come from on-chain data. If `symbol` can contain `\0`, couldn't `name` also have this problem? Maybe we should consider this:

    ```ts
    tokenName: name?.includes("\0") ? null : name,
    tokenSymbol: symbol?.includes("\0") ? null : symbol,
    ```

### Example: Request changes review

    The fix looks good for ERC721 tokens, but I think the same issue could affect ERC20 tokens in getTokenDetails() (~line 384).

    Should we also apply this protection there?

### Example: Iterating on comments with the user

Present each comment one by one and wait for approval:

    **Comment 1** — `parseClaim`, catch block (new line ~357):

    > In `parseCompleteTransfer` the catch correctly re-throws non-`UnsupportedCurrencyError`
    > exceptions, but here they're silently swallowed and fall through to
    > `throw new UnsupportedTxnError(... "Unsupported event-type")`; misleading if the real error
    > was e.g. a network failure. Should add `throw err` for consistency:
    >
    > ```ts
    > } catch (err: unknown) {
    >   if (err instanceof UnsupportedCurrencyError) {
    >     throw new UnsupportedTxnError(this.getId(), err.toString(), transfer);
    >   }
    >   throw err;
    > }
    > ```

    Good to go, or want changes?

After user confirms, move to the next:

    **Comment 2** — `transformTransfers`, the removed try/catch (around line 594):

    > Removing this catch also drops the `logger.warn` for unsupported txns; the error still
    > propagates and crashes the sync, but now without any logs. I'd keep the warning log even
    > if we simplify the catch.

    Good to go?

After all comments are confirmed, ask for review type and message:

    All comments finalized. Before submitting:

    1. **Review type**: `COMMENT`, `REQUEST_CHANGES`, or `APPROVE`?
    2. **Top-level message**: any summary you'd like, or should I draft one?

## Review Checklist

- [ ] Does the fix address the stated problem?
- [ ] Are there similar patterns elsewhere that need the same fix?
- [ ] Are related fields/variables also affected? (e.g., if `symbol` needs protection, does `name`?)
- [ ] Is the approach consistent with existing code style?
- [ ] Are there alternative approaches worth discussing?
- [ ] Do tests pass? Are new tests needed?
