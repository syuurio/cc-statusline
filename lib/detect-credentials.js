import { execFileSync } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'

export function detectCredentials() {
  // 1. macOS Keychain (execFileSync — no shell injection)
  try {
    const json = execFileSync('security',
      ['find-generic-password', '-s', 'Claude Code-credentials', '-w'],
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim()
    if (JSON.parse(json)?.claudeAiOauth?.accessToken) return true
  } catch {}

  // 2. ~/.claude/.credentials.json
  const credFile = `${homedir()}/.claude/.credentials.json`
  if (existsSync(credFile)) {
    try {
      if (JSON.parse(readFileSync(credFile, 'utf8'))?.claudeAiOauth?.accessToken) return true
    } catch {}
  }

  return false
}
