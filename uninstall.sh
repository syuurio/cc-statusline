#!/bin/bash
# cc-statusline uninstaller
# Usage: curl -fsSL https://raw.githubusercontent.com/syuurio/cc-statusline/main/uninstall.sh | bash

set -euo pipefail

INSTALL_DIR="$HOME/.claude"
SCRIPT_NAME="statusline-command.sh"
SETTINGS_FILE="$INSTALL_DIR/settings.json"
CACHE_DIR="${XDG_CACHE_HOME:-$HOME/.cache}/cc-statusline"

# Colors
GREEN=$'\033[32m'
YELLOW=$'\033[33m'
CYAN=$'\033[36m'
BOLD=$'\033[1m'
RESET=$'\033[0m'

info()  { echo "${CYAN}[info]${RESET}  $*"; }
ok()    { echo "${GREEN}[ok]${RESET}    $*"; }
warn()  { echo "${YELLOW}[warn]${RESET}  $*"; }

echo ""
echo "${BOLD}cc-statusline uninstaller${RESET}"
echo "──────────────────────────"
echo ""

# Remove script
if [[ -f "$INSTALL_DIR/$SCRIPT_NAME" ]]; then
    rm -f "$INSTALL_DIR/$SCRIPT_NAME"
    ok "Removed ${BOLD}$INSTALL_DIR/$SCRIPT_NAME${RESET}"
else
    warn "Script not found at $INSTALL_DIR/$SCRIPT_NAME (already removed?)"
fi

# Remove statusLine from settings.json
if [[ -f "$SETTINGS_FILE" ]]; then
    has_statusline=$(jq 'has("statusLine")' "$SETTINGS_FILE" 2>/dev/null) || has_statusline="false"
    if [[ "$has_statusline" == "true" ]]; then
        tmp=$(mktemp "$INSTALL_DIR/settings.XXXXXX")
        jq 'del(.statusLine)' "$SETTINGS_FILE" > "$tmp" && mv "$tmp" "$SETTINGS_FILE"
        ok "Removed statusLine from ${BOLD}$SETTINGS_FILE${RESET}"
    else
        info "No statusLine found in settings.json — nothing to remove."
    fi
else
    info "No settings.json found."
fi

# Remove cache directory
if [[ -d "$CACHE_DIR" ]]; then
    rm -rf "$CACHE_DIR"
    ok "Removed cache directory ${BOLD}$CACHE_DIR${RESET}"
else
    info "No cache directory found."
fi

echo ""
echo "${GREEN}${BOLD}Uninstallation complete.${RESET}"
echo ""
echo "  Restart Claude Code to apply changes."
echo ""
