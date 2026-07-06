#!/usr/bin/env node
// PostToolUse/Edit hook (dev-workflow.md): prettier a szerkesztett fájlon.
// Node-dal olvassuk a stdin JSON-t, mert jq nincs telepítve minden gépen.
import { execSync } from 'node:child_process'

let input = ''
process.stdin.on('data', (chunk) => (input += chunk))
process.stdin.on('end', () => {
  let file
  try {
    file = JSON.parse(input).tool_input?.file_path
  } catch {
    return
  }
  if (!file) return

  const quoted = `"${file.replace(/"/g, '\\"')}"`
  try {
    execSync(`pnpm exec prettier --ignore-unknown --write ${quoted}`, { stdio: 'inherit' })
  } catch {
    // formázási hiba nem szabad blokkolja a munkafolyamatot
  }
})
