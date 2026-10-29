#!/bin/sh
# SessionStart hook: refresh the status line script in the plugin data dir,
# which survives plugin updates while the plugin root does not.
# Prints nothing on success, since SessionStart stdout becomes session context.
root=$1
data=$2
script="$data/statusline-command.sh"
mkdir -p "$data"

if [ -f "$data/config.json" ]; then
    # Without node the custom script cannot be regenerated; keep the last one.
    command -v node >/dev/null 2>&1 || exit 0
    exec node "$root/lib/cli.js" generate --config "$data/config.json" --out "$script"
fi

tmp="$script.$$.tmp"
cp "$root/src/statusline-command.sh" "$tmp" && chmod 755 "$tmp" && mv "$tmp" "$script"
