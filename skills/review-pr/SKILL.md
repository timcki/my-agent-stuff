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

## Review Checklist

- [ ] Does the fix address the stated problem?
- [ ] Are there similar patterns elsewhere that need the same fix?
- [ ] Are related fields/variables also affected? (e.g., if `symbol` needs protection, does `name`?)
- [ ] Is the approach consistent with existing code style?
- [ ] Are there alternative approaches worth discussing?
- [ ] Do tests pass? Are new tests needed?
