# Plan: `user-message-frame` Extension

## Goal

Restyle user messages in the TUI to look like right-aligned chat bubbles with rounded frames (matching the amp-frame editor aesthetic), making them visually distinct from assistant output.

## Visual Design

```
(20% indent)          ╭──────────────────────────────────────────────────────╮
                      │ please read all files in extensions/read-many/       │
                      ╰──────────────────────────────────────────────────────╯
```

- **Left indent:** 20% of terminal width (minimum ~4 columns, so the frame is always usable)
- **Frame:** Rounded corners `╭╮╰╯`, vertical borders `│`, horizontal borders `─`
- **Border color:** Matches the editor's thinking-level color (from `theme.getThinkingBorderColor(level)`)
- **Content:** Full markdown rendering inside the frame, text wraps to fit the narrower width
- **Background:** `userMessageBg` preserved inside the frame
- **Images:** Placeholder `[N image(s) attached]` shown inside the bubble
- **Multi-line:** Long messages wrap naturally within the frame boundaries

## Technical Approach

### Why monkey-patching

There is no extension API to override user message rendering (`registerMessageRenderer` only handles custom messages with `customType`). The interactive mode directly instantiates `UserMessageComponent` and adds it to the chat container. This is the same situation as `amp-frame`, which monkey-patches `setEditorComponent`.

### Strategy: Patch `UserMessageComponent.prototype.render`

`UserMessageComponent` is exported from `@mariozechner/pi-coding-agent` and extends `Container`. Its constructor adds:
1. `Spacer(1)` — blank line above
2. `Markdown(text, 1, 1, theme, { bgColor, color })` — the message with background

We patch the prototype's `render(width)` method to:
1. Calculate indent = `Math.max(4, Math.floor(width * 0.2))`
2. Calculate inner width = `width - indent - 2` (2 for left+right border `│`)
3. Call the original render with `innerWidth` (so Markdown wraps to the narrower width)
4. Strip the leading spacer line (we'll re-add it)
5. Wrap content lines with `│` borders
6. Add top border (`╭─...─╮`) and bottom border (`╰─...─╯`)
7. Prepend `indent` spaces to every framed line
8. Re-add the spacer line at the top

### ANSI-safe width calculations

Lines from `Markdown.render()` contain ANSI escape codes (SGR styling, colors, etc.). All width measurements and padding must use `visibleWidth()` from `@mariozechner/pi-tui`, never naive `.length`. When padding a content line to fill the frame, compute `visibleWidth(line)` and pad with `innerWidth - visibleWidth(line)` spaces. Same caution applies to truncation — use `truncateToWidth()` if a line exceeds the inner width.

Reference: `toolview-compact/sanitize.ts` and its tests demonstrate the hazards of non-renderable characters (OSC sequences, SGR codes, control chars) affecting width calculations.

### Border color

We need the current thinking level at render time. The extension captures `pi` (for `pi.getThinkingLevel()`) and `ctx` (for `ctx.ui.theme`) from `session_start`/`session_switch` events. The border color function is obtained via `theme.getThinkingBorderColor(level)` at render time — no caching, so it always reflects the current state.

### Compatibility with amp-frame

`amp-frame` only patches the editor component rendering. `user-message-frame` only patches `UserMessageComponent.prototype.render`. They operate on different components, so they coexist without conflict.

### Invalidation / theme changes

Since we compute the border color inside `render()` using the live theme and thinking level, theme changes and thinking level changes take effect on the next render automatically. We also patch `invalidate()` to clear any cached state.

## File Structure

```
extensions/user-message-frame/
├── index.ts       — Entry point, patches UserMessageComponent on session_start
└── frame.ts       — Frame rendering logic (indent, borders, wrapping)
```

### `index.ts`

- Exports the default extension factory
- On `session_start` / `session_switch`: stores latest `ExtensionContext` reference
- Patches `UserMessageComponent.prototype.render` once (guarded by a `Symbol` to avoid double-patching, same pattern as amp-frame's `PATCHED` symbol)
- The patched `render(width)`:
  1. Computes indent and inner width
  2. Delegates to original `render(innerWidth)` to get content lines
  3. Passes content lines + width + colorFn to `wrapInFrame()`
  4. Falls back to original render on error or narrow terminals

### `frame.ts`

Exports `wrapInFrame(lines, fullWidth, indent, colorFn)`:

1. **Separate spacer:** Leading empty lines are split off from content
2. **Top border:** `pad + colorFn("╭") + colorFn("─".repeat(innerWidth)) + colorFn("╮")`
3. **Content lines:** For each line:
   - Measure with `visibleWidth(line)`
   - If shorter than `innerWidth`: right-pad with spaces
   - If longer: truncate with `truncateToWidth(line, innerWidth)`
   - Wrap: `pad + colorFn("│") + paddedLine + colorFn("│")`
4. **Bottom border:** `pad + colorFn("╰") + colorFn("─".repeat(innerWidth)) + colorFn("╯")`
5. **Return:** spacer lines + framed lines

## Edge Cases

- **Very narrow terminals:** If `width < 20`, skip framing and fall back to original render
- **Empty messages:** Shouldn't happen (interactive mode checks `textContent` is truthy), but handle gracefully — return original render
- **Kill switch:** Respect `PI_USER_MESSAGE_FRAME=0` env var to disable (same pattern as amp-frame)

## Testing

- Manual: Run `pi -e ./extensions/user-message-frame/index.ts` alongside amp-frame
- Verify short single-line messages
- Verify long multi-line wrapping messages
- Verify messages with markdown (bold, code, links) — ANSI width handling
- Verify with different thinking levels (border color changes)
- Verify theme switching
- Verify narrow terminal (< 20 cols graceful fallback)
- Verify coexistence with amp-frame
