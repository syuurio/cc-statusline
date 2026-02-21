#!/bin/bash
# cc-statusline installer
# Usage:
#   Default:  curl -fsSL https://raw.githubusercontent.com/syuurio/cc-statusline/main/install.sh | bash
#   Wizard:   curl -fsSL https://raw.githubusercontent.com/syuurio/cc-statusline/main/install.sh | bash -s -- --wizard

set -euo pipefail

# ══════════════════════════════════════════════════════════════════════════════
# CONSTANTS
# ══════════════════════════════════════════════════════════════════════════════

REPO_URL="https://raw.githubusercontent.com/syuurio/cc-statusline/main"
INSTALL_DIR="$HOME/.claude"
SCRIPT_NAME="statusline-command.sh"
SETTINGS_FILE="$INSTALL_DIR/settings.json"

# Colors
RED=$'\033[31m'
GREEN=$'\033[32m'
YELLOW=$'\033[33m'
CYAN=$'\033[36m'
BOLD=$'\033[1m'
RESET=$'\033[0m'

# ══════════════════════════════════════════════════════════════════════════════
# HELPERS
# ══════════════════════════════════════════════════════════════════════════════

info()  { echo "${CYAN}[info]${RESET}  $*"; }
ok()    { echo "${GREEN}[ok]${RESET}    $*"; }
warn()  { echo "${YELLOW}[warn]${RESET}  $*"; }
fail()  { echo "${RED}[fail]${RESET}  $*"; exit 1; }

check_dep() {
    command -v "$1" &>/dev/null || fail "Missing dependency: ${BOLD}$1${RESET}. Please install it first."
}

check_node_version() {
    if ! command -v node &>/dev/null; then
        fail "Missing dependency: ${BOLD}node${RESET} (>= 18). Install from https://nodejs.org/"
    fi
    local version major
    version=$(node --version 2>/dev/null)
    major=$(echo "$version" | sed 's/^v//' | cut -d. -f1)
    if [[ -z "$major" ]] || [[ "$major" -lt 18 ]]; then
        fail "Node.js >= 18 required (found ${BOLD}$version${RESET}). Update from https://nodejs.org/"
    fi
}

# ══════════════════════════════════════════════════════════════════════════════
# ARGUMENT PARSING
# ══════════════════════════════════════════════════════════════════════════════

WIZARD_MODE=0
for arg in "$@"; do
    case "$arg" in
        --wizard) WIZARD_MODE=1 ;;
        *)        fail "Unknown option: $arg" ;;
    esac
done

# ══════════════════════════════════════════════════════════════════════════════
# PRE-FLIGHT CHECKS
# ══════════════════════════════════════════════════════════════════════════════

echo ""
echo "${BOLD}cc-statusline installer${RESET}"
echo "────────────────────────"
echo ""

# Check required dependencies
info "Checking dependencies..."
if [[ "$WIZARD_MODE" == "1" ]]; then
    for dep in git curl; do
        check_dep "$dep"
    done
    check_node_version
else
    for dep in jq bc git curl; do
        check_dep "$dep"
    done
    # python3 is needed for date formatting on macOS
    if [[ "$(uname -s)" == "Darwin" ]]; then
        check_dep python3
    fi
fi
ok "All dependencies found."

# ══════════════════════════════════════════════════════════════════════════════
# WIZARD
# ══════════════════════════════════════════════════════════════════════════════

run_wizard() {
    local tmpdir
    tmpdir=$(mktemp -d "${TMPDIR:-/tmp}/cc-statusline-wizard.XXXXXX")
    trap "rm -rf \"$tmpdir\"" EXIT

    info "Cloning cc-statusline repository..."
    git clone --depth 1 https://github.com/syuurio/cc-statusline.git "$tmpdir" 2>/dev/null \
        || fail "Failed to clone repository."
    ok "Repository cloned."

    info "Installing dependencies..."
    (cd "$tmpdir" && npm install --no-fund --no-audit 2>/dev/null) \
        || fail "Failed to install npm dependencies."
    ok "Dependencies installed."

    info "Starting setup wizard..."
    echo ""
    node "$tmpdir/setup.js" < /dev/tty
}

# ══════════════════════════════════════════════════════════════════════════════
# MAIN
# ══════════════════════════════════════════════════════════════════════════════

if [[ "$WIZARD_MODE" == "1" ]]; then
    run_wizard
else

# ══════════════════════════════════════════════════════════════════════════════
# DOWNLOAD
# ══════════════════════════════════════════════════════════════════════════════

info "Downloading statusline script..."
mkdir -p "$INSTALL_DIR"

# Download to temp file first, then move (atomic)
tmp_script=$(mktemp "$INSTALL_DIR/install.XXXXXX")
trap 'rm -f "$tmp_script"' EXIT

if ! curl -fsSL "$REPO_URL/src/$SCRIPT_NAME" -o "$tmp_script"; then
    fail "Failed to download $SCRIPT_NAME"
fi

mv "$tmp_script" "$INSTALL_DIR/$SCRIPT_NAME"
trap - EXIT  # clear trap since file was moved

ok "Installed ${BOLD}$INSTALL_DIR/$SCRIPT_NAME${RESET}"

# ══════════════════════════════════════════════════════════════════════════════
# PATCH SETTINGS
# ══════════════════════════════════════════════════════════════════════════════

STATUSLINE_VALUE="{\"type\":\"command\",\"command\":\"bash $INSTALL_DIR/$SCRIPT_NAME\"}"

patch_settings() {
    local tmp
    tmp=$(mktemp "$INSTALL_DIR/settings.XXXXXX")

    if [[ ! -f "$SETTINGS_FILE" ]]; then
        # No settings file — create minimal one
        jq -n --argjson sl "$STATUSLINE_VALUE" '{statusLine: $sl}' > "$tmp"
        mv "$tmp" "$SETTINGS_FILE"
        ok "Created ${BOLD}$SETTINGS_FILE${RESET} with statusLine."
        return
    fi

    # Settings file exists — check for existing statusLine
    local has_statusline
    has_statusline=$(jq 'has("statusLine")' "$SETTINGS_FILE" 2>/dev/null) || has_statusline="false"

    if [[ "$has_statusline" == "true" ]]; then
        # Already has statusLine — check if it's ours
        local current_cmd
        current_cmd=$(jq -r '.statusLine.command // ""' "$SETTINGS_FILE" 2>/dev/null)

        if [[ "$current_cmd" == *"statusline-command.sh"* ]]; then
            # Already configured with our script — update in place
            jq --argjson sl "$STATUSLINE_VALUE" '.statusLine = $sl' "$SETTINGS_FILE" > "$tmp"
            mv "$tmp" "$SETTINGS_FILE"
            ok "Updated existing statusLine config."
            return
        fi

        # Different statusLine — ask for confirmation
        warn "settings.json already has a statusLine configuration:"
        echo "    $(jq -c '.statusLine' "$SETTINGS_FILE")"
        echo ""
        printf "  Overwrite? [y/N] "

        # When piped from curl, stdin is the script itself — use /dev/tty
        if read -r answer < /dev/tty 2>/dev/null; then
            case "$answer" in
                [yY]|[yY][eE][sS])
                    jq --argjson sl "$STATUSLINE_VALUE" '.statusLine = $sl' "$SETTINGS_FILE" > "$tmp"
                    mv "$tmp" "$SETTINGS_FILE"
                    ok "Replaced statusLine config."
                    ;;
                *)
                    rm -f "$tmp"
                    warn "Skipped patching settings.json. Add manually:"
                    echo "    \"statusLine\": $STATUSLINE_VALUE"
                    return
                    ;;
            esac
        else
            rm -f "$tmp"
            warn "Non-interactive mode — skipped overwrite. Add manually:"
            echo "    \"statusLine\": $STATUSLINE_VALUE"
            return
        fi
    else
        # No statusLine key — add it
        jq --argjson sl "$STATUSLINE_VALUE" '. + {statusLine: $sl}' "$SETTINGS_FILE" > "$tmp"
        mv "$tmp" "$SETTINGS_FILE"
        ok "Added statusLine to ${BOLD}$SETTINGS_FILE${RESET}"
    fi
}

info "Patching settings.json..."
patch_settings

# ══════════════════════════════════════════════════════════════════════════════
# DONE
# ══════════════════════════════════════════════════════════════════════════════

echo ""
echo "${GREEN}${BOLD}Installation complete!${RESET}"
echo ""
echo "  Restart Claude Code to see the new status line."
echo ""
echo "  Uninstall:"
echo "    curl -fsSL $REPO_URL/uninstall.sh | bash"
echo ""

fi
