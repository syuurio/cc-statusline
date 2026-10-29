---
name: setup
description: Install or reconfigure the cc-statusline status line in settings.json.
disable-model-invocation: true
---

# cc-statusline setup

Plugins cannot set `statusLine` themselves, so this skill writes it into the user's `settings.json`. All file writes go through `lib/cli.js`; it owns the command format and file permissions.

- CLI: `node "${CLAUDE_PLUGIN_ROOT}/lib/cli.js"`
- Data dir: `${CLAUDE_PLUGIN_DATA}`

## 1. Check dependencies

Run `command -v node jq bc`. Done when all three resolve. If any is missing, name it, tell the user to install it, and stop.

## 2. Note a v1 install

Read `statusLine.command` from `${CLAUDE_CONFIG_DIR:-$HOME/.claude}/settings.json`. Record whether it references `statusline-command.sh` outside `${CLAUDE_PLUGIN_DATA}`: that is a v1 `install.sh` copy, handled in step 5.

## 3. Choose defaults or customize

Ask with AskUserQuestion: "Use the default status line?" Options: "Use defaults (Recommended)", "Customize".

- Defaults: run `node "${CLAUDE_PLUGIN_ROOT}/lib/cli.js" install --data "${CLAUDE_PLUGIN_DATA}"` and go to step 5.
- Customize: go to step 4.

## 4. Customize

Run `node "${CLAUDE_PLUGIN_ROOT}/lib/cli.js" detect-oauth`. `true` means rate-limit fields are available; `false` means omit `rateBar` and `resetTimes` from every question.

Ask round 1 in one AskUserQuestion call, every question `multiSelect: true`:

| Question | Options (field id) |
| --- | --- |
| Line 1 identity | Account (`account`), Model (`model`), Effort (`effort`), Directory (`dir`) |
| Line 1 status | Git branch (`git`), Token count (`tokens`), Session cost (`cost`), plus Context bar (`ctxBar`) when `detect-oauth` is `false` |
| Bars (only when `detect-oauth` is `true`) | Context bar (`ctxBar`), 5h/7d rate bars (`rateBar`), Reset times (`resetTimes`) |

Ask round 2 in one AskUserQuestion call, single-select:

| Question | Options (config value) |
| --- | --- |
| Separator | `›` (Recommended), `\|`, `·`, `→` |
| Color scheme | Default (`default`), Traffic light (`traffic-light`), Monochrome (`monochrome`) |
| Bar style | Thin ━─ (`thin`), Dot ●○ (`dot`), Block █░ (`block`) |
| Warn / danger % | 50 / 80 (Recommended), 60 / 90, 70 / 95 |

Build the config. `fields` lists the selected ids in this order: `account, model, effort, dir, git, tokens, cost, ctxBar, rateBar, resetTimes`. If no field was selected, ask round 1 again.

```json
{"fields": [...], "separator": "›", "colorScheme": "default", "barStyle": "thin", "thresholds": {"warn": 50, "danger": 80}}
```

Run `node "${CLAUDE_PLUGIN_ROOT}/lib/cli.js" install --data "${CLAUDE_PLUGIN_DATA}" --config '<json>'`. Done when it exits 0. On a non-zero exit, show its stderr and fix the config.

## 5. Finish

If step 2 found a v1 install, ask whether to delete that old script file; delete it only on yes.

Tell the user the status line appears on the next update (send a message or press shift+tab), with no restart. Mention `/cc-statusline:setup` reconfigures it and `/cc-statusline:uninstall` removes it before uninstalling the plugin.
