#!/bin/bash
# cc-statusline — Claude Code Enhanced Status Line
# https://github.com/syuurio/cc-statusline
#
# Features:
# - Model name with icon
# - Working directory (shortened)
# - Git branch with dirty indicator
# - Context window usage (percentage + tokens)
# - API usage (5-hour / 7-day limits) with stale-while-revalidate
# - Session cost
# - Cross-platform (macOS + Linux)

# ══════════════════════════════════════════════════════════════════════════════
# CONFIGURATION
# ══════════════════════════════════════════════════════════════════════════════

# Colors (ANSI 256)
C_RESET=$'\033[0m'
C_BOLD=$'\033[1m'
C_DIM=$'\033[2m'
C_PURPLE=$'\033[38;5;141m'      # Model
C_BLUE=$'\033[38;5;75m'         # Directory
C_GREEN=$'\033[38;5;114m'       # Git clean / low usage
C_YELLOW=$'\033[38;5;221m'      # Git dirty / medium usage
C_RED=$'\033[38;5;204m'         # High usage
C_GRAY=$'\033[38;5;245m'        # Dim text
C_GRAY_LIGHT=$'\033[38;5;250m'  # Lighter gray for labels
C_CYAN=$'\033[38;5;116m'        # Tokens
C_ORANGE=$'\033[38;5;215m'      # Cost

# Icons / Separator
ICON_MODEL="🤖"
ICON_SEPARATOR="›"

# Thresholds for color coding usage (percentage)
USAGE_WARN=50
USAGE_DANGER=80

# Cache settings
CACHE_DIR="${XDG_CACHE_HOME:-$HOME/.cache}/cc-statusline"
USAGE_CACHE="$CACHE_DIR/usage.json"
USAGE_LOCK="$CACHE_DIR/.fetch.lock"
CACHE_MAX_AGE=300   # 5 minutes
LOCK_MAX_AGE=30     # stale lock timeout

# Platform detection (done once)
_IS_MACOS=0
[[ "$(uname -s)" == "Darwin" ]] && _IS_MACOS=1

# ══════════════════════════════════════════════════════════════════════════════
# HELPER FUNCTIONS
# ══════════════════════════════════════════════════════════════════════════════

# Cross-platform file mtime (epoch seconds)
get_file_mtime() {
    if [[ "$_IS_MACOS" == "1" ]]; then
        stat -f '%m' "$1" 2>/dev/null || echo 0
    else
        stat -c '%Y' "$1" 2>/dev/null || echo 0
    fi
}

# Format large numbers (e.g., 15234 -> 15.2K)
format_tokens() {
    local num=$1
    if [[ -z "$num" ]] || [[ "$num" == "null" ]]; then
        echo "0"
        return
    fi

    if [[ "$num" -ge 1000000 ]]; then
        printf "%.1fM" "$(echo "scale=1; $num / 1000000" | bc)"
    elif [[ "$num" -ge 1000 ]]; then
        printf "%.1fK" "$(echo "scale=1; $num / 1000" | bc)"
    else
        echo "$num"
    fi
}

# Get color based on usage percentage
get_usage_color() {
    local pct=$1
    if [[ -z "$pct" ]]; then
        echo "$C_GRAY"
    elif [[ "$pct" -ge "$USAGE_DANGER" ]]; then
        echo "$C_RED"
    elif [[ "$pct" -ge "$USAGE_WARN" ]]; then
        echo "$C_YELLOW"
    else
        echo "$C_GREEN"
    fi
}

# Create visual progress bar (thin style: ━ filled, ─ empty)
progress_bar() {
    local pct=${1:-0}
    local width=${2:-5}

    [[ "$pct" -lt 0 ]] && pct=0
    [[ "$pct" -gt 100 ]] && pct=100

    local filled=$((pct * width / 100))
    local empty=$((width - filled))

    local bar=""
    for ((i=0; i<filled; i++)); do bar+="━"; done
    for ((i=0; i<empty; i++)); do bar+="─"; done

    echo "$bar"
}

# Format ISO 8601 reset time to local time (cross-platform)
format_reset_time() {
    local iso="$1" fmt="$2"
    [[ -z "$iso" ]] || [[ "$iso" == "null" ]] && return

    local epoch
    if [[ "$_IS_MACOS" == "1" ]]; then
        epoch=$(python3 -c "from datetime import datetime; print(int(datetime.fromisoformat('$iso').timestamp()))" 2>/dev/null) || return
        date -r "$epoch" +"$fmt" 2>/dev/null
    else
        # Linux: try date -d first, fallback to python3
        if date -d "$iso" +"$fmt" 2>/dev/null; then
            return
        fi
        epoch=$(python3 -c "from datetime import datetime; print(int(datetime.fromisoformat('$iso').timestamp()))" 2>/dev/null) || return
        date -d "@$epoch" +"$fmt" 2>/dev/null
    fi
}

# ══════════════════════════════════════════════════════════════════════════════
# CREDENTIAL & USAGE FETCH
# ══════════════════════════════════════════════════════════════════════════════

# Retrieve access token with platform fallback
get_access_token() {
    # Strategy 1: macOS Keychain
    if command -v security &>/dev/null; then
        local json
        json=$(security find-generic-password -s "Claude Code-credentials" -w 2>/dev/null) || true
        if [[ -n "$json" ]]; then
            local token
            token=$(echo "$json" | jq -r '.claudeAiOauth.accessToken // empty' 2>/dev/null)
            [[ -n "$token" ]] && echo "$token" && return 0
        fi
    fi

    # Strategy 2: credentials file (Linux / fallback)
    local cred="$HOME/.claude/.credentials.json"
    if [[ -f "$cred" ]]; then
        jq -r '.claudeAiOauth.accessToken // empty' "$cred" 2>/dev/null
        return
    fi

    return 1
}

# Background fetch with lock (prevents concurrent fetches)
fetch_usage_bg() {
    # Clean stale lock
    if [[ -d "$USAGE_LOCK" ]]; then
        local lock_age=$(( $(date +%s) - $(get_file_mtime "$USAGE_LOCK") ))
        if [[ "$lock_age" -ge "$LOCK_MAX_AGE" ]]; then
            rmdir "$USAGE_LOCK" 2>/dev/null || true
        else
            return 0  # another fetch in progress
        fi
    fi

    # Acquire lock (mkdir is atomic)
    mkdir "$USAGE_LOCK" 2>/dev/null || return 0

    # Background fetch
    (
        trap 'rmdir "$USAGE_LOCK" 2>/dev/null' EXIT

        local token
        token=$(get_access_token) || { return; }

        # Write token to temp file (avoid inline secrets in process list)
        local tf
        tf=$(mktemp "$CACHE_DIR/tok.XXXXXX")
        chmod 600 "$tf"
        printf 'Authorization: Bearer %s' "$token" > "$tf"

        local resp
        resp=$(curl -s --max-time 5 "https://api.anthropic.com/api/oauth/usage" \
            -H @"$tf" \
            -H "anthropic-beta: oauth-2025-04-20" 2>/dev/null)

        rm -f "$tf"

        if [[ -n "$resp" ]] && echo "$resp" | jq -e '.five_hour' > /dev/null 2>&1; then
            resp=$(echo "$resp" | jq ". + {\"fetched_at\": $(date +%s)}")
            # Atomic cache write
            local tmp
            tmp=$(mktemp "$CACHE_DIR/cache.XXXXXX")
            echo "$resp" > "$tmp" && mv "$tmp" "$USAGE_CACHE"
        fi
    ) & disown
}

# Read usage data with stale-while-revalidate pattern
get_usage_data() {
    if [[ -f "$USAGE_CACHE" ]]; then
        cat "$USAGE_CACHE"
        # Check staleness, trigger background refresh if needed
        local age=$(( $(date +%s) - $(get_file_mtime "$USAGE_CACHE") ))
        if [[ "$age" -ge "$CACHE_MAX_AGE" ]]; then
            fetch_usage_bg
        fi
    else
        fetch_usage_bg
        echo '{}'
    fi
}

# ══════════════════════════════════════════════════════════════════════════════
# MAIN LOGIC
# ══════════════════════════════════════════════════════════════════════════════

# Ensure cache dir exists with restricted permissions
mkdir -p "$CACHE_DIR"
chmod 700 "$CACHE_DIR"

# Read JSON input from stdin
input=$(cat)

# jq helper — single parse, extract by path
_jq() { echo "$input" | jq -r "$1" 2>/dev/null; }

# Parse JSON values from Claude Code
cwd=$(_jq '.workspace.current_dir // empty')
model=$(_jq '.model.display_name // empty')
remaining_pct=$(_jq '.context_window.remaining_percentage // empty')
total_input=$(_jq '.context_window.total_input_tokens // 0')
total_output=$(_jq '.context_window.total_output_tokens // 0')
context_size=$(_jq '.context_window.context_window_size // 200000')
session_cost=$(_jq '.cost.total_cost_usd // 0')
session_id=$(_jq '.session_id // empty')

# Calculate context usage
if [[ -n "$remaining_pct" ]]; then
    used_pct=$(printf "%.0f" "$(echo "100 - $remaining_pct" | bc)" 2>/dev/null) || used_pct=0
else
    used_pct=0
fi

# Total tokens used
total_tokens=$(( ${total_input:-0} + ${total_output:-0} ))

# Fetch API usage (stale-while-revalidate)
usage_data=$(get_usage_data)

# jq helper for usage data
_jqu() { echo "$usage_data" | jq -r "$1" 2>/dev/null; }

five_hour_pct=$(_jqu '.five_hour.utilization // empty')
seven_day_pct=$(_jqu '.seven_day.utilization // empty')
five_hour_reset=$(_jqu '.five_hour.resets_at // empty')
seven_day_reset=$(_jqu '.seven_day.resets_at // empty')

five_reset_fmt=$(format_reset_time "${five_hour_reset:-}" "%H:%M")
seven_reset_fmt=$(format_reset_time "${seven_day_reset:-}" "%-m/%-d %H:%M")

# ══════════════════════════════════════════════════════════════════════════════
# BUILD OUTPUT (Three-line layout)
# ══════════════════════════════════════════════════════════════════════════════

line1=""
line2=""
line3=""

SEP=" ${C_GRAY}${ICON_SEPARATOR}${C_RESET} "

# ─────────────────────────────────────────────────────────────────────────────
# LINE 1: Model, Directory, Git, Tokens, Cost
# ─────────────────────────────────────────────────────────────────────────────

# 1. Model name with icon
if [[ -n "$model" ]]; then
    short_model=$(echo "$model" | sed 's/Claude //')
    line1+="${C_PURPLE}${ICON_MODEL} ${short_model}${C_RESET}"
fi

# 2. Working directory (folder name only)
if [[ -n "$cwd" ]]; then
    folder_name=$(basename "$cwd")
    line1+="${SEP}${C_BLUE}${folder_name}${C_RESET}"
fi

# 3. Git branch with dirty indicator
if [[ -n "$cwd" ]] && [[ -d "$cwd" ]]; then
    git_branch=$(git -C "$cwd" branch --show-current 2>/dev/null)
    if [[ -n "$git_branch" ]]; then
        git_status=$(git -C "$cwd" status --porcelain 2>/dev/null)
        if [[ -n "$git_status" ]]; then
            line1+="${SEP}${C_YELLOW}${git_branch}*${C_RESET}"
        else
            line1+="${SEP}${C_GREEN}${git_branch}${C_RESET}"
        fi
    fi
fi

# 4. Token count
formatted_tokens=$(format_tokens "$total_tokens")
formatted_max=$(format_tokens "$context_size")
line1+="${SEP}${C_CYAN}${formatted_tokens}/${formatted_max}${C_RESET}"

# 5. Session cost
if [[ -n "$session_cost" ]] && [[ "$session_cost" != "0" ]]; then
    formatted_cost=$(printf "%.2f" "$session_cost")
    line1+="${SEP}${C_ORANGE}\$${formatted_cost}${C_RESET}"
fi

# ─────────────────────────────────────────────────────────────────────────────
# LINE 2: Context bar, 5h bar, 7d bar
# ─────────────────────────────────────────────────────────────────────────────

line2+="${C_GRAY}├${C_RESET}"

# Context usage bar
ctx_color=$(get_usage_color "$used_pct")
ctx_bar=$(progress_bar "$used_pct" 10)
line2+=" ${C_GRAY_LIGHT}[ctx]${C_RESET} ${ctx_color}${ctx_bar} ${used_pct}%${C_RESET}"

# API Usage bars
if [[ -n "$five_hour_pct" ]] && [[ "$five_hour_pct" != "null" ]]; then
    five_int=${five_hour_pct%.*}
    seven_int=${seven_day_pct%.*}
    five_color=$(get_usage_color "$five_int")
    seven_color=$(get_usage_color "$seven_int")
    five_bar=$(progress_bar "$five_int" 10)
    seven_bar=$(progress_bar "$seven_int" 10)
    line2+="${SEP}${C_GRAY_LIGHT}[5h]${C_RESET} ${five_color}${five_bar} ${five_int}%${C_RESET}"
    line2+="${SEP}${C_GRAY_LIGHT}[7d]${C_RESET} ${seven_color}${seven_bar} ${seven_int}%${C_RESET}"
fi

# ─────────────────────────────────────────────────────────────────────────────
# LINE 3: Reset times
# ─────────────────────────────────────────────────────────────────────────────

line3+="${C_GRAY}╰${C_RESET}"

if [[ -n "$five_hour_pct" ]] && [[ "$five_hour_pct" != "null" ]]; then
    line3+=" ${C_GRAY}5-hour resets ${five_reset_fmt:-—}${C_RESET}"
    line3+="${SEP}${C_GRAY}weekly resets ${seven_reset_fmt:-—}${C_RESET}"
fi

# Output the three-line status
printf "%s\n%s\n%s" "$line1" "$line2" "$line3"
