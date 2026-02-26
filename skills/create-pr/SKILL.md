---
name: create-pr
description: "Create a GitHub PR with proper formatting and Linear issue linking"
---

# Create Pull Request

Create a GitHub pull request following project standards, with proper Linear issue linking.

## Process

1. **Run lint checks** before anything else:
   ```bash
   yarn lint --fix
   yarn lint
   ```
   If lint still fails after `--fix`, resolve the remaining issues before proceeding.

2. **Get the Linear issue number** from the user (e.g., `INT-3370`, `BLK-123`)

3. **Find the branch** - there should already be a pushed branch containing the issue number:
   ```bash
   git branch -a | grep -i <issue-number>
   ```

4. **Review the changes** to understand what to include in the description:
   ```bash
   jj diff --from 'trunk()' --to '@-' --stat
   jj log -r '::@ & trunk()::@'
   ```

5. **Draft the PR title + description**

6. **If available, run `edit_proposed_text`** to let the user edit drafts before confirmation:
   - first for title (`purpose: PR title`, `fileExtension: txt`)
   - then for body (`purpose: PR description`, `fileExtension: md`)
   Use the returned text as final title/body.

7. **Create the PR** using the gh CLI:
   ```bash
   gh pr create --head <branch-name> --title "<title>" --body "<body>"
   ```

## Title Format

Always include the Linear issue number in square brackets at the start:

```
[INT-3370] Short description of the change
```

- Keep it concise but descriptive
- Use sentence case (capitalize first word only)
- No period at end

## Description Format

Start directly with the context - no "Description:" or "Summary:" headers needed.

Structure:
1. **Opening line**: What happened / what's wrong / what changed — get straight to the point. Vary the phrasing naturally, don't always start with "This fixes..." or "This adds...".
2. **Context**: Brief explanation of the problem or motivation (2-3 sentences max)
3. **Changes section**: Bullet list of what changed

Use conversational, collaborative tone (same as review-pr skill).

## Examples

**Title:**
```
[INT-3370] Filter ZK Stack system transfers + migrate Abstract to V3
```

**Body:**
```
Transaction parsing on ZK Stack chains (Abstract, zkSync Era) was broken — every transaction involves ETH transfers to/from the bootloader (`0x8001`) for gas handling, and we were incorrectly treating these as user deposits/withdrawals.

Example: user unwraps 0.0009 WETH → ETH, but we reported withdrawal 0.0027 + deposit 0.0018 (the bootloader gas mechanics).

### Changes

* Migrate Abstract from V1 to V3 integration (same base as zkSync Era)
* Add `isZkStackChain()` and `getSystemAddressesToFilter()` to V3 base
* Filter transfers to/from bootloader (`0x8001`) and MsgValueSimulator (`0x8009`)
* Add unit tests for the filtering logic

The filtering happens in `parseEvents()` before the DefaultHandler processes transfers, so protocol-specific handlers aren't affected.
```

---

**Title:**
```
[INT-3403] Fix zkSync Era sync failures with native explorer API
```

**Body:**
```
zkSync Era wallet syncs were broken after migrating to the native explorer API in #2178. The API has several incompatibilities with standard Etherscan that caused syncs to fail or loop infinitely.

### Changes

* Limit page size to 1000 (explorer enforces PageNo × Offset ≤ 1000)
* Force `sort=asc` — explorer defaults to descending, breaking `startBlock` pagination
* Check both `message` and `result` fields for error strings (zkSync puts errors in `result`)
* Exclude `token1155tx` from supported token types — not implemented by this explorer

Verified all 4 wallets from the issue sync successfully.
```

---

**Title:**
```
Regenerate e2e schema after unsoldBuyReportId int64 change
```

**Body:**
```
#131 updated `UnsoldBuyReportId` to `int64` in the Go models but didn't regenerate the e2e schema. The `unsold_buy_report_id` columns in `init.sql` were still `INTEGER` instead of `BIGINT`. I ran `go run ./cmd/generate_schema` to sync `e2e/scripts/db/init.sql` with the updated models.
```

Note: for small, self-explanatory changes a simple paragraph is fine — no need for a `### Changes` section or bullet points.

## Confirm Before Creating

Always show the full (possibly edited) title and description to the user and ask for confirmation before running `gh pr create`.

Do NOT create the PR without user approval.
