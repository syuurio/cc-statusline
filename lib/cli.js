#!/usr/bin/env node
/**
 * Non-interactive entry point for the plugin's skills and hooks.
 *
 *   generate --config <file> --out <file>
 *   install --data <dir> [--config <json>]
 *   uninstall --data <dir>
 *   detect-oauth
 */

import { readFileSync, writeFileSync, renameSync, rmSync, mkdirSync, existsSync, copyFileSync, chmodSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { generateScript } from './generate.js'
import { DEFAULT_CONFIG } from './defaults.js'
import { applyStatusLine, removeStatusLine } from './patch-settings.js'
import { detectCredentials } from './detect-credentials.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SCRIPT_NAME = 'statusline-command.sh'
const KNOWN_FIELDS = DEFAULT_CONFIG.fields

export function parseConfig(raw) {
  const config = { ...DEFAULT_CONFIG, ...JSON.parse(raw) }
  if (!Array.isArray(config.fields) || config.fields.length === 0) {
    throw new Error('config.fields must be a non-empty array')
  }
  const unknown = config.fields.filter(f => !KNOWN_FIELDS.includes(f))
  if (unknown.length > 0) throw new Error(`unknown fields: ${unknown.join(', ')}`)
  return config
}

function writeAtomic(path, content, mode) {
  mkdirSync(dirname(path), { recursive: true })
  const tmp = `${path}.${process.pid}.tmp`
  writeFileSync(tmp, content, { mode })
  renameSync(tmp, path)
}

function settingsPath() {
  return join(process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude'), 'settings.json')
}

function readSettings(path) {
  return existsSync(path) ? readFileSync(path, 'utf8') : '{}'
}

function generate({ config, out }) {
  writeAtomic(out, generateScript(parseConfig(readFileSync(config, 'utf8'))), 0o755)
}

function install({ data, config }) {
  const script = join(data, SCRIPT_NAME)
  const configFile = join(data, 'config.json')
  if (config) {
    writeAtomic(configFile, JSON.stringify(parseConfig(config), null, 2) + '\n', 0o644)
    generate({ config: configFile, out: script })
  } else {
    rmSync(configFile, { force: true })
    mkdirSync(data, { recursive: true })
    copyFileSync(join(ROOT, 'src', SCRIPT_NAME), script)
    chmodSync(script, 0o755)
  }
  const settings = settingsPath()
  writeAtomic(settings, applyStatusLine(readSettings(settings), script), 0o644)
  console.log(`Installed ${script}\nPatched ${settings}`)
}

function uninstall({ data }) {
  const settings = settingsPath()
  if (!existsSync(settings)) return
  writeAtomic(settings, removeStatusLine(readSettings(settings), join(data, SCRIPT_NAME)), 0o644)
  console.log(`Patched ${settings}`)
}

const COMMANDS = {
  generate: { run: generate, required: ['config', 'out'] },
  install: { run: install, required: ['data'] },
  uninstall: { run: uninstall, required: ['data'] },
  'detect-oauth': { run: () => console.log(String(detectCredentials())), required: [] },
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [name, ...rest] = process.argv.slice(2)
  const command = COMMANDS[name]
  try {
    if (!command) throw new Error(`usage: cli.js <${Object.keys(COMMANDS).join('|')}> [options]`)
    const { values } = parseArgs({
      args: rest,
      options: { config: { type: 'string' }, out: { type: 'string' }, data: { type: 'string' } },
    })
    const missing = command.required.filter(k => !values[k])
    if (missing.length > 0) throw new Error(`${name}: missing --${missing.join(', --')}`)
    command.run(values)
  } catch (err) {
    console.error(`cc-statusline: ${err.message}`)
    process.exit(1)
  }
}
