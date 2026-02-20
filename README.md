# cc-statusline

A rich, customizable 3-line status line for [Claude Code](https://docs.anthropic.com/en/docs/claude-code).

```
🤖 Opus 4 › my-project › main* › 57.0K/200.0K › $1.23
├ [ctx] ━━──────── 28% › [5h] ━━━━━───── 50% › [7d] ━━━━━━━─── 80%
╰ [↻5h] 04:00 21 Feb › [↻7d] 22:00 22 Feb
```

**Line 1** — Model, directory, git branch, token usage, session cost
**Line 2** — Context window bar, 5-hour & 7-day API rate limit bars
**Line 3** — Rate limit reset times

---

## Quick Start

```bash
curl -fsSL https://raw.githubusercontent.com/syuurio/cc-statusline/main/install.sh | bash
```

Restart Claude Code after installing.

---

## Interactive Wizard

Want to customize? The wizard lets you configure everything visually with a live preview:

```bash
git clone https://github.com/syuurio/cc-statusline.git
cd cc-statusline && npm install
node setup.js
```

The wizard guides you through:

| Option           | Choices                                                                  |
| ---------------- | ------------------------------------------------------------------------ |
| **Fields**       | Model, directory, git, tokens, cost, context bar, rate bars, reset times |
| **Separator**    | `›` `\|` `·` `→`                                                         |
| **Color scheme** | Default (ANSI 256), Traffic light (green/yellow/red), Monochrome         |
| **Bar style**    | Thin `━─`, Dot `●○`, Block `█░`                                          |
| **Thresholds**   | Warn % and Danger % for color coding                                     |

A live preview shows your statusline before writing anything. On confirmation, the wizard writes:

- `~/.claude/statusline-command.sh` — generated bash script
- `~/.claude/settings.json` — patched with `statusLine` config

Requires **Node.js >= 18** for the wizard only. The generated script itself has no Node.js dependency.

---

## Features

- **Fully customizable** — pick exactly which fields to show via the interactive wizard
- **Live preview** — see your statusline before committing
- **3 color schemes** — ANSI 256, traffic light, monochrome
- **3 bar styles** — thin, dot, block
- **Background fetch** — API usage is fetched with stale-while-revalidate caching (no UI blocking)
- **Cross-platform** — macOS (Keychain) + Linux (credentials file)
- **Self-contained** — generated script has zero runtime dependencies beyond standard CLI tools
- **Pure architecture** — script generator is a pure function, fully testable

---

## How It Works

Claude Code pipes JSON into the statusline script via stdin. The script:

1. Parses session metadata (model, tokens, cost, context window) with `jq`
2. Reads git branch and dirty status from the working directory
3. Fetches API usage data with a 3-minute stale-while-revalidate cache (background fetch, no UI blocking)
4. Renders a 3-line output with ANSI colors and progress bars

Credentials are read from macOS Keychain first, falling back to `~/.claude/.credentials.json` on Linux. Cache is stored in `${XDG_CACHE_HOME:-~/.cache}/cc-statusline/`.

### Architecture

```
lib/defaults.js                  Single source of truth for shared constants
       ↓
lib/generate.js (pure)           config → bash script string
       ↓
setup.js (wizard)                scripts/build.js
  @clack/prompts flow              generates src/statusline-command.sh
  ├── detect credentials           from default config (npm run build)
  ├── select fields
  ├── choose options             lib/patch-settings.js (pure)
  ├── live preview                 JSON string → patched JSON string
  └── write files
                                 lib/detect-credentials.js
                                   keychain / file → boolean
```

`src/statusline-command.sh` is a **generated file** — it is produced by `npm run build` using `lib/generate.js` with default config. This ensures the quick-install script and the wizard output come from the same code path.

The wizard (`setup.js`) is the only module that performs I/O. `generate.js` and `patch-settings.js` are pure functions.

### Development

After modifying `lib/generate.js` or `lib/defaults.js`, regenerate the default script:

```bash
npm run build
```

This updates `src/statusline-command.sh`, which is what `install.sh` downloads.

---

## Requirements

The **generated bash script** requires:

| Tool      | Purpose                      |
| --------- | ---------------------------- |
| `jq`      | JSON parsing                 |
| `bc`      | Arithmetic                   |
| `git`     | Branch and status detection  |
| `curl`    | API usage requests           |
| `python3` | Date formatting (macOS only) |

The **interactive wizard** additionally requires Node.js >= 18.

---

## Uninstall

```bash
curl -fsSL https://raw.githubusercontent.com/syuurio/cc-statusline/main/uninstall.sh | bash
```

This removes the statusline script, cleans up `settings.json`, and deletes the cache directory.

---

## Disclaimer

This project is **not affiliated with, endorsed by, or officially supported by Anthropic**. It is an independent, community-built tool.

The rate limit feature (5-hour / 7-day bars and reset times) accesses locally stored OAuth credentials to retrieve usage data. This may not be compliant with Anthropic's [Consumer Terms of Service](https://www.anthropic.com/legal/consumer-terms), which state that OAuth tokens are intended exclusively for Claude Code and Claude.ai. Use this feature at your own risk.

If you prefer to avoid any ToS concerns, you can use the interactive wizard to disable rate limit fields — all other features (model, directory, git, tokens, cost, context bar) rely solely on data provided by Claude Code via stdin and do not access any external credentials or APIs.

---

## Acknowledgments

Wizard design informed by [aromanarguello/claude-statusline](https://github.com/aromanarguello/claude-statusline).

## License

[MIT](LICENSE)
