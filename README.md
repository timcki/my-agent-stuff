# my-agent-stuff

Skills, themes, and extensions for [pi coding agent](https://github.com/badlogic/pi-mono).

## Install
```bash
pi install git:github.com/timcki/my-agent-stuff
```

## Skills

- **commit** - Read this skill before making git commits
- **edit-draft** - Open draft text in an external editor with guaranteed prefill
- **jujutsu** - Use jujutsu (jj) for version control instead of git

## Extensions

### amp-frame

Decorates the editor input frame with rounded corners and side borders (amp-style):

```
╭── deep ──────────────────────────╮
│ your prompt here                 │
╰─────────────────────────────────╯
```

Works as a render-only decorator — it wraps any editor component (including `pi-amplike`'s mode editor) without patching upstream code. All typing, cursor, autocomplete, and scroll behavior is unchanged.

**Disable:** Set `PI_AMP_FRAME=0` in your environment to turn off the frame decorator.

### edit-proposed-text

Adds an `edit_proposed_text` tool that opens proposed text in your editor before finalizing (commit messages, PR body, etc.).

Behavior:
- in zellij: opens `nvim` in a floating pane by default (fallback: normal pane)
- outside zellij: falls back to pi's built-in multiline editor UI
- waits until editor exits, then returns edited text to the agent

Keybind:
- `Ctrl+Shift+E`: edit the current prompt/input text in external editor and paste result back

Environment:
- uses `PI_EDIT_TEXT_EDITOR`, then `$VISUAL`, then `$EDITOR`, then `nvim`

### toolview-compact

Compact, safe rendering for built-in tool output. Replaces the default rendering of `read`, `bash`, `edit`, `write`, `find`, `grep`, and `ls` with compact summaries that collapse long output and sanitize unsafe escape sequences (OSC, ANSI, control chars) to prevent crashes.

**Features:**
- **Compact summaries** — one-line status with key metadata (path, line count, exit code, match count, etc.)
- **Collapse long output** — shows first 3 + last 2 lines with hidden count; expand with `Ctrl+O`
- **Safe rendering** — strips OSC (hyperlinks, notifications), ANSI SGR, and control chars before layout
- **Presets** — `regular` (collapse >40 lines or >4000 chars) and `terse` (>15 lines or >1500 chars)
- **Per-tool toggles** — enable/disable compact rendering per tool
- **Raw mode** — optionally show unsanitized output in expanded view

**Commands:**
| Command | Description |
|---------|-------------|
| `/toolview show` | Show current config |
| `/toolview preset terse\|regular` | Switch collapse thresholds |
| `/toolview tool <name> on\|off` | Enable/disable a tool override (restart required) |
| `/toolview raw on\|off` | Toggle raw output mode |

**Config:** `~/.pi/tool-display-compact.json`

```json
{
  "preset": "regular",
  "rawViewEnabled": false,
  "toolEnabled": {
    "read": true, "bash": true, "edit": true, "write": true,
    "find": true, "grep": true, "ls": true
  },
  "thresholds": {
    "regular": { "maxLines": 40, "maxChars": 4000 },
    "terse": { "maxLines": 15, "maxChars": 1500 }
  },
  "preview": { "headLines": 3, "tailLines": 2 }
}
```

### jina-web-tools

Adds two tools backed by Jina APIs:
- `web_search`: web search via `https://s.jina.ai`
- `visit_webpage`: page extraction via `https://r.jina.ai` (and image URL download support)

Behavior:
- uses `JINA_API_KEY` when available (for higher rate limits)
- truncates large outputs and saves full output to temp files when needed
- `visit_webpage` retries transient Jina reader errors (451/5xx)
