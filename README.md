# cc-statusline

A custom 3-line status line for [Claude Code](https://docs.anthropic.com/en/docs/claude-code), showing model info, context usage, API rate limits, and more.

```
🤖 Opus 4 › my-project › main* › 57.0K/200.0K › $1.23
├ [ctx] ━━──────── 28% › [5h] ━━━━━───── 50% › [7d] ━━━━━━━─── 80%
╰ 5-hour resets 04:00 › weekly resets 2/22 22:00
```

## Features

- **Model name** — current Claude model
- **Directory** — active workspace folder
- **Git branch** — with dirty indicator (`*`)
- **Token usage** — input + output vs context window
- **Session cost** — running USD total
- **Context bar** — visual context window usage
- **5-hour / 7-day rate bars** — API usage with color thresholds
- **Reset times** — when rate limits reset
- **Background fetch** — stale-while-revalidate caching (no UI blocking)
- **Cross-platform** — macOS (Keychain) + Linux (credentials file)

## Install

```bash
curl -fsSL https://raw.githubusercontent.com/syuurio/cc-statusline/main/install.sh | bash
```

Restart Claude Code after installing.

## Requirements

- `jq` — JSON parsing
- `bc` — arithmetic
- `git` — branch/status detection
- `curl` — API requests
- `python3` — date formatting (macOS)

## Interactive Setup (Wizard)

Customize your statusline with an interactive wizard:

```bash
npx @syuurio/cc-statusline
```

The wizard lets you:

- **Pick fields** — choose which info to display (model, dir, git, tokens, cost, bars, reset times)
- **Choose a separator** — `›`, `|`, `·`, or `→`
- **Select a color scheme** — default (ANSI 256), traffic-light, or monochrome
- **Pick a bar style** — thin `━─`, dot `●○`, or block `█░`
- **Set thresholds** — warn/danger percentages for color coding
- **Live preview** — see your statusline before writing

The wizard writes `~/.claude/statusline-command.sh` and patches `~/.claude/settings.json` automatically.

Requires **Node.js >= 18**.

## Uninstall

```bash
curl -fsSL https://raw.githubusercontent.com/syuurio/cc-statusline/main/uninstall.sh | bash
```

## How It Works

The statusline script receives JSON from Claude Code via stdin, parses session metadata, and fetches API usage from `api.anthropic.com/api/oauth/usage` with a 5-minute cache. Background fetching ensures the UI never blocks on network requests.

Credentials are read from macOS Keychain first, falling back to `~/.claude/.credentials.json` on Linux.

Cache is stored in `${XDG_CACHE_HOME:-~/.cache}/cc-statusline/`.

## License

MIT
