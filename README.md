# my-agent-stuff

Skills, themes, and extensions for [pi coding agent](https://github.com/badlogic/pi-mono).

## Install
```bash
pi install git:github.com/timcki/my-agent-stuff
```

## Skills

- **commit** - Read this skill before making git commits
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
