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
