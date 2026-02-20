#!/usr/bin/env node
/**
 * Generates src/statusline-command.sh from lib/generate.js with default config.
 * Run: npm run build
 */

import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, dirname } from 'node:path'
import { generateScript } from '../lib/generate.js'
import { DEFAULT_CONFIG } from '../lib/defaults.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dest = join(root, 'src', 'statusline-command.sh')

const script = generateScript(DEFAULT_CONFIG)
writeFileSync(dest, script, { mode: 0o755 })

console.log(`Generated ${dest}`)
