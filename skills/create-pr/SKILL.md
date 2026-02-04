---
name: create-pr
description: "Create a GitHub PR with proper formatting and Linear issue linking"
---

# Create Pull Request

Create a GitHub pull request following project standards, with proper Linear issue linking.

## Process

1. **Get the Linear issue number** from the user (e.g., `INT-3370`, `BLK-123`)

2. **Find the branch** - there should already be a pushed branch containing the issue number:
   ```bash
   git branch -a | grep -i <issue-number>
   ```

3. **Review the changes** to understand what to include in the description:
   ```bash
   jj diff --from 'trunk()' --to '@-' --stat
   jj log -r '::@ & trunk()::@'
   ```

4. **Draft the PR description** and show it to the user for confirmation

5. **Create the PR** using the gh CLI:
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
1. **Opening line**: What this fixes/adds (start with "This fixes...", "This adds...", etc.)
2. **Context**: Brief explanation of the problem or motivation (2-3 sentences max)
3. **Changes section**: Bullet list of what changed

Use conversational, collaborative tone (same as review-pr skill).

## Example

**Title:**
```
[INT-3370] Filter ZK Stack system transfers + migrate Abstract to V3
```

**Body:**
```
This fixes incorrect transaction parsing on ZK Stack chains (Abstract, zkSync Era). 

On these chains, every transaction involves ETH transfers to/from the bootloader (`0x8001`) for gas handling. We were incorrectly treating these as user deposits/withdrawals.

Example: user unwraps 0.0009 WETH → ETH, but we reported withdrawal 0.0027 + deposit 0.0018 (the bootloader gas mechanics).

### Changes

* Migrate Abstract from V1 to V3 integration (same base as zkSync Era)
* Add `isZkStackChain()` and `getSystemAddressesToFilter()` to V3 base
* Filter transfers to/from bootloader (`0x8001`) and MsgValueSimulator (`0x8009`)
* Add unit tests for the filtering logic

The filtering happens in `parseEvents()` before the DefaultHandler processes transfers, so protocol-specific handlers aren't affected.
```

## Confirm Before Creating

Always show the full title and description to the user and ask for confirmation before running `gh pr create`.

Do NOT create the PR without user approval.
