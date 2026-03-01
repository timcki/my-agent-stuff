# ToolView Compact — Implementation Plan (MVP)

## Goal
Build a custom replacement for `pi-tool-display` that makes built-in tool output compact, skimmable, and safe (no crash-inducing escape-sequence leaks), using only stable pi extension APIs.

## Scope (MVP)
Override and custom-render these built-in tools:
- `read`
- `bash`
- `edit`
- `write`
- `find`
- `grep`
- `ls`

### Deferred
- Generic compact renderer for unknown/MCP tools (tracked as `TODO-f3195efa`).

## Product decisions (locked)
- Default rendering mode: **collapsed**.
- Collapse trigger: by **both** thresholds (`lines` OR `chars`).
- Presets:
  - `regular`: collapse when `lines > 40` OR `chars > 4000`
  - `terse`: collapse when `lines > 15` OR `chars > 1500`
- Preview lines when collapsed: **5** (`first 3 + last 2`).
- Show explicit hidden notice, e.g. `+142 lines hidden`.
- Error behavior: collapsed error preview + expandable full error output.
- `read` summary: path + total lines + byte size + file type (no mtime).
- `bash` summary: command preview + exit code + duration + stdout/stderr line counts.
- `find`/`grep`: include match/result counts + glob/filter info.
- `ls`: path + entry count + flags/filter info.
- `edit`: include diff stats/preview (uses built-in `details.diff`).
- `write`: simple stats only (path + bytes + line count), no diff.
- Interaction: slash commands only.
- Presets: `terse`, `regular`.
- Persistence: user-global JSON, restart required for config reload in MVP.
- Safety: sanitize ANSI/OSC/control chars for display/width calcs; preserve raw output for expandable raw view.
- Width policy: truncate with ellipsis.
- Compatibility target: stable APIs, Ghostty focus, should coexist with `amp-frame`.

---

## High-level architecture

## Directory layout
Create:

```txt
extensions/toolview-compact/
  index.ts
  types.ts
  config.ts
  sanitize.ts
  rendering.ts
  summaries.ts
  tools.ts
  commands.ts
  __tests__/
    sanitize.test.ts
```

## Module responsibilities

### `types.ts`
Shared types:
- `ToolviewPreset = "terse" | "regular"`
- `ToolName = "read" | "bash" | "edit" | "write" | "find" | "grep" | "ls"`
- `ToolviewConfig`:
  - `preset`
  - `rawViewEnabled`
  - `toolEnabled: Record<ToolName, boolean>`
  - `thresholds` per preset
  - preview constants (`headLines=3`, `tailLines=2`)

### `config.ts`
- Config path: `~/.pi/tool-display-compact.json`
- `loadConfig(): ToolviewConfig`
- `saveConfig(config)` (atomic write via temp file + rename)
- `validateConfig(raw)` with fallback to defaults
- `getDefaultConfig()`

### `sanitize.ts`
Core safety sanitizer:
- `sanitizeForDisplay(text: string): string`
- `stripAnsiSgr(text)`
- `stripOsc(text)` handles:
  - OSC BEL terminator (`\x07`)
  - OSC ST terminator (`\x1b\\`)
- `stripControlChars(text)` keeps only printable + `\n` + `\t`
- `toRawView(text)` returns original unchanged string

> Important: all width/count calculations must run on sanitized text, never raw.

### `rendering.ts`
Shared render helpers:
- collapse decision from thresholds
- line/char counting
- preview extraction (`first 3 + last 2`)
- hidden counters (`+N lines hidden`, `+M chars hidden` optional)
- width-safe truncation with ellipsis (per rendered line)
- error preview builder
- raw toggle rendering path
- helper to include expand hint via `keyHint("expandTools", "to expand")`

### `summaries.ts`
Per-tool summary text generation:
- `summarizeRead(...)`
- `summarizeBash(...)`
- `summarizeEdit(...)`
- `summarizeWrite(...)`
- `summarizeFind(...)`
- `summarizeGrep(...)`
- `summarizeLs(...)`

### `tools.ts`
- Construct original tools with built-ins:
  - `createReadTool`, `createBashTool`, `createEditTool`, `createWriteTool`, `createFindTool`, `createGrepTool`, `createLsTool`
- Re-register with same names.
- Delegate `execute()` to originals.
- Override `renderCall()` and `renderResult()` for compact output.
- For `bash`, wrap execute to capture `durationMs` in details metadata (if not already available), while preserving original result shape.

### `commands.ts`
Register:
- `/toolview preset terse|regular`
- `/toolview tool <name> on|off`
- `/toolview raw on|off`
- `/toolview show` (recommended; prints effective config)

### `index.ts`
- Load config once at startup.
- Register commands.
- Register tool overrides for enabled tools.
- Show startup notification (optional, muted) with active preset.

---

## Detailed implementation instructions

## 1) Build config system first
1. Implement `ToolviewConfig` defaults with explicit values:
   - `preset: "regular"`
   - `rawViewEnabled: false`
   - `toolEnabled`: all seven tools `true` (user can opt-out per tool).
2. Load config at extension init; on parse/validation error:
   - fallback to defaults
   - `ctx.ui.notify` warning only when UI exists.
3. Save on `/toolview ...` command changes.
4. Document restart requirement in `/toolview` output and README.

### JSON example
```json
{
  "preset": "regular",
  "rawViewEnabled": false,
  "toolEnabled": {
    "read": true,
    "bash": true,
    "edit": true,
    "write": true,
    "find": true,
    "grep": true,
    "ls": true
  },
  "thresholds": {
    "regular": { "maxLines": 40, "maxChars": 4000 },
    "terse": { "maxLines": 15, "maxChars": 1500 }
  },
  "preview": { "headLines": 3, "tailLines": 2 }
}
```

## 2) Implement sanitization before rendering
1. Add robust OSC stripping (root crash regression requirement).
2. Sanitize in this order:
   - strip OSC
   - strip SGR/ANSI
   - strip remaining control chars except `\n` `\t`
3. Keep raw text separately in memory for optional raw expansion.
4. Never feed raw text to width/layout calculations.

## 3) Shared rendering primitives
Implement pure helpers first (easy to unit-test manually and reason about):
- `shouldCollapse(lines, chars, presetThresholds)`
- `buildPreview(lines)` returning `head + tail` and hidden counts
- `truncateRenderedLine(line, width)` using ellipsis
- `renderCollapsedBlock({summary, preview, notices, isError, expanded, rawMode})`

Behavior rules:
- Always show summary line first.
- If collapsed and long: show 5-line preview + hidden notice.
- If expanded: show full sanitized output.
- If raw mode enabled and expanded: show raw output block (clearly labeled `RAW`).
- Errors: same structure but with error-first summary styling.

## 4) Tool override wiring
For each tool:
1. Build original tool instance with `create*Tool(cwd)`.
2. Register replacement with same `name`, `description`, `parameters`.
3. Delegate `execute` untouched unless metadata enrichment needed.
4. In `renderCall`, keep compact one-liners (tool + key args).
5. In `renderResult`, call shared summarizer + shared renderer.

### Per-tool summary contract

#### `read`
- call args summary: path + offset/limit if present.
- result summary fields:
  - file path
  - type (`text`/`image`)
  - total lines (from content)
  - byte size
  - truncation note if built-in truncation details exist

#### `bash`
- call summary: compact `$ <cmd-preview>` + timeout if set.
- result summary:
  - exit code (`ok` if 0)
  - duration
  - stdout/stderr line counts (best effort from output parsing)
  - truncation/full-output-path hints if provided by details
- errors shown as collapsed error preview by default.

#### `edit`
- summary includes path + diff stats from `details.diff`:
  - additions/removals
- expanded view: syntax-colored-ish diff lines if feasible; otherwise plain with prefixes.

#### `write`
- summary includes:
  - path
  - bytes written
  - line count from `args.content`
- no diff computation in MVP.

#### `grep`
- summary includes:
  - match count
  - pattern
  - glob/filter args
  - `ignoreCase`, `literal`, `context`, `limit` when set
  - limit/truncation indicators from details

#### `find`
- summary includes:
  - result count
  - pattern
  - search path
  - limit/truncation indicators

#### `ls`
- summary includes:
  - path
  - entry count
  - limit info (if reached)

## 5) Slash command UX
Implement parser in `commands.ts`:

### `/toolview preset terse|regular`
- updates `preset`
- persists config
- confirms change

### `/toolview tool <name> on|off`
- validates `<name>` in supported tool set
- toggles config
- persists
- note that restart is required

### `/toolview raw on|off`
- toggles raw expansion mode availability
- persists

### `/toolview show`
- prints current preset, thresholds, enabled tools, raw mode, config path

## 6) Compatibility and API safety
- No monkeypatching internal renderer classes.
- Use only stable extension APIs from docs (`registerTool`, `registerCommand`, `keyHint`, etc.).
- Ensure return shapes match built-in tool results (`content`, `details`, `isError` semantics).
- Keep `amp-frame` untouched (render-only coexistence).

---

## Milestones

## M1 — Scaffolding + config + commands
Deliverables:
- module skeleton in `extensions/toolview-compact/`
- working config load/save
- `/toolview` commands with persistence

Definition of done:
- command roundtrip updates JSON correctly
- invalid JSON falls back safely

## M2 — Sanitizer + core renderer
Deliverables:
- `sanitize.ts` complete
- shared collapse/preview/ellipsis helpers in `rendering.ts`

Definition of done:
- manual checks with ANSI/OSC payloads show no raw escapes in compact view

## M3 — Tool overrides (read/bash/edit/write)
Deliverables:
- complete overrides with summaries
- edit diff stats visible
- write stats visible

Definition of done:
- each tool has compact collapsed view + expanded view
- errors are collapsed with preview and expandable full details

## M4 — Tool overrides (find/grep/ls)
Deliverables:
- search/list summaries and preview behavior

Definition of done:
- match/result/entry counts and filters shown consistently

## M5 — QA hardening + docs
Deliverables:
- sanitizer unit tests
- manual crash regression checklist executed
- README usage docs

Definition of done:
- acceptance criteria below pass

---

## Test plan

## Unit tests (required)
`extensions/toolview-compact/__tests__/sanitize.test.ts`
- strips SGR sequences
- strips OSC BEL sequences (`\x1b]...\x07`)
- strips OSC ST sequences (`\x1b]...\x1b\\`)
- strips control chars while preserving `\n` and `\t`
- preserves normal text
- raw-view accessor returns unmodified text

## Manual test matrix
For each tool (`read/bash/edit/write/find/grep/ls`):
1. short output (should remain compact and readable)
2. long output (collapsed with `3+2` preview)
3. expanded output (Ctrl+O)
4. error case (collapsed error preview + expandable full)
5. raw mode toggle behavior

### Crash regression scenarios (critical)
- bash/read outputs containing OSC 777 notify
- OSC 8 hyperlink sequences
- mixed ANSI + OSC + very long lines (width stress)
- repeated runs to confirm no intermittent layout crashes

Target outcome: no crash, no overflow-induced renderer failure.

### Environment validation
- Ghostty terminal
- with `amp-frame` enabled

---

## Acceptance criteria (v1)
1. All 7 built-in tools have pleasant compact rendering and are skimmable.
2. Extension does not crash pi under OSC/ANSI/control-character stress.
3. `/toolview` command config works and persists globally.

---

## File-by-file implementation checklist
- [ ] `extensions/toolview-compact/index.ts`
- [ ] `extensions/toolview-compact/types.ts`
- [ ] `extensions/toolview-compact/config.ts`
- [ ] `extensions/toolview-compact/sanitize.ts`
- [ ] `extensions/toolview-compact/rendering.ts`
- [ ] `extensions/toolview-compact/summaries.ts`
- [ ] `extensions/toolview-compact/tools.ts`
- [ ] `extensions/toolview-compact/commands.ts`
- [ ] `extensions/toolview-compact/__tests__/sanitize.test.ts`
- [ ] `README.md` section: ToolView Compact usage and commands

---

## Notes for implementation sequence
Recommended coding order:
1. `types.ts` + `config.ts`
2. `sanitize.ts`
3. `rendering.ts`
4. `summaries.ts`
5. `tools.ts`
6. `commands.ts`
7. `index.ts`
8. tests + README

This order minimizes rework and surfaces safety issues early.