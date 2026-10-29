# cc-statusline

A rich, customizable 3-line status line for [Claude Code](https://code.claude.com/docs), packaged as a Claude Code plugin.

```
◆ work › 🤖 Opus 5.5 › ⚡ xhigh › my-project › main* › 57.0K/1.0M › $1.23
├ [ctx] ━━──────── 28% › [5h] ━━━━━───── 50% › [7d] ━━━━━━━─── 80%
╰ [↻ 5h] 04:00 21 Feb › [↻ 7d] 22:00 22 Feb
```

**Line 1** — Account, model, reasoning effort, directory, git branch, context tokens, session cost
**Line 2** — Context window bar, 5-hour and 7-day rate limit bars
**Line 3** — Rate limit reset times

The account label comes from `DEV_PROFILE` if set, otherwise from the `CLAUDE_CONFIG_DIR` folder name (`~/.claude-work` → `work`); the default `~/.claude` shows as `default`. Effort is colored by level and hidden when the model does not support it. Rate limits arrive only after the session's first API response (Pro and Max plans), so the bars show `--%` placeholders until then.

---

## Install

cc-statusline is listed in the `syuurio` marketplace, [syuurio/claude-plugins](https://github.com/syuurio/claude-plugins). That repository is private, so git needs an account with read access:

```bash
claude plugin marketplace add syuurio/claude-plugins
claude plugin install cc-statusline@syuurio --scope user
```

then run `/cc-statusline:setup` in a session. No restart is needed; the status line appears on the next update (send a message or press shift+tab).

A plugin cannot set `statusLine` on its own, which is why the setup step exists: it writes the entry into `settings.json` (in `CLAUDE_CONFIG_DIR` when set).

### Updates

With auto-update on for the `syuurio` marketplace, Claude Code installs a new version on its own and shows `Plugin updated: cc-statusline · Run /reload-plugins to apply`. Third-party marketplaces start with auto-update off; turn it on in `/plugin` → **Marketplaces** → `syuurio` → **Enable auto-update**, or update manually with `claude plugin update cc-statusline@syuurio`. The next session then refreshes the status line script, keeping your customization.

### Customize

Run `/cc-statusline:setup` again and choose **Customize**:

| Option           | Choices                                                                          |
| ---------------- | -------------------------------------------------------------------------------- |
| **Fields**       | Account, model, effort, directory, git, tokens, cost, context bar, rate bars, reset times |
| **Separator**    | `›` `\|` `·` `→`                                                                 |
| **Color scheme** | Default (ANSI 256), Traffic light (green/yellow/red), Monochrome                 |
| **Bar style**    | Thin `━─`, Dot `●○`, Block `█░`                                                  |
| **Thresholds**   | Warn % and danger % for color coding                                             |

### Uninstall

```
/cc-statusline:uninstall
```

then `claude plugin uninstall cc-statusline@syuurio`. Run the skill first: Claude Code runs nothing when a plugin is uninstalled, so the skill is what removes the `statusLine` entry. If you skip it, the leftover entry is harmless and the status line just goes blank.

Disabling the plugin does **not** hide the status line; the script stays in place and only stops receiving updates. Use `/cc-statusline:uninstall` to turn it off.

### Migrating from v1

v1 installed with `install.sh` into `~/.claude/statusline-command.sh`. Install the plugin and run `/cc-statusline:setup`; it replaces the `statusLine` entry and offers to delete the old script.

---

## Requirements

| Tool   | Purpose                                  |
| ------ | ---------------------------------------- |
| `jq`   | JSON parsing                             |
| `bc`   | Arithmetic                               |
| `git`  | Branch and status detection              |
| `node` | `/cc-statusline:setup` (Node.js >= 18)   |

Once set up, the status line itself needs only bash, `jq`, `bc` and `git`. Without `node`, a customized script keeps working but is not regenerated after plugin updates.

---

## How It Works

Claude Code pipes session JSON into the status line script on stdin. The script parses it with `jq`, reads the git branch from the working directory, and renders three lines with ANSI colors and progress bars. Rate limits and effort come from that same stdin JSON; nothing is fetched over the network.

```
lib/defaults.js            default config, single source of truth
lib/generate.js (pure)     config → bash script
lib/patch-settings.js      settings.json → patched settings.json
lib/cli.js                 generate / install / uninstall / detect-oauth
scripts/sync.sh            SessionStart hook: refresh the script in the plugin data dir
skills/setup, uninstall    /cc-statusline:setup, /cc-statusline:uninstall
src/statusline-command.sh  generated default script (npm run build)
```

The script lives in `~/.claude/plugins/data/cc-statusline-syuurio/`, which survives plugin updates. `settings.json` points there through a guarded command that prints nothing if the script is missing. A customized config is saved next to it as `config.json`.

### Development

```bash
npm test
npm run build                       # after editing lib/generate.js or lib/defaults.js
claude plugin validate .
claude --plugin-dir ./              # load the working tree for one session (cc-statusline@inline)
```

### Release

1. Raise `version` in `.claude-plugin/plugin.json`. The version is what marks a release: commits pushed without raising it never reach installed copies. The marketplace entry carries no version, so syuurio/claude-plugins does not change.
2. Merge to `main`.

---

## Disclaimer

This project is **not affiliated with, endorsed by, or officially supported by Anthropic**. It is an independent, community-built tool.

During setup, `detect-oauth` checks whether Claude Code OAuth credentials exist (macOS Keychain or `~/.claude/.credentials.json`) only to decide whether to offer the rate limit fields. It checks that a token is present and nothing more: the token is never stored, sent anywhere, or used to call an API.

---

## Acknowledgments

Wizard design informed by [aromanarguello/claude-statusline](https://github.com/aromanarguello/claude-statusline).

## License

[MIT](LICENSE)
