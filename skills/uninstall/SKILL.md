---
name: uninstall
description: Remove the cc-statusline status line from settings.json before uninstalling the plugin.
disable-model-invocation: true
---

# cc-statusline uninstall

Claude Code runs nothing when a plugin is uninstalled, so the `statusLine` entry is removed here first.

1. Run `node "${CLAUDE_PLUGIN_ROOT}/lib/cli.js" uninstall --data "${CLAUDE_PLUGIN_DATA}"`. Done when it exits 0. It only removes a `statusLine` that points at this plugin's script and leaves every other setting alone.
2. Tell the user the status line is gone on the next update, and that they can now run `claude plugin uninstall cc-statusline@cc-statusline`, which also deletes the plugin data dir.
