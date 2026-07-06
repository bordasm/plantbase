#!/usr/bin/env node
// PostToolUse/Edit hook (dev-workflow.md): a szerkesztett fájlhoz tartozó Vitest fut.
// "vitest related" a workspace-aggregátorral megbízhatatlan volt ebben a monorepóban
// (globals-config néha nem érvényesült), ezért a fájl tulajdonos Nx projektjének
// teljes `test` targetjét futtatjuk -- a legközelebbi felfelé lévő package.json alapján.
import { execSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

function findOwningProject(filePath) {
  let dir = dirname(filePath)
  while (true) {
    const pkgPath = join(dir, 'package.json')
    if (existsSync(pkgPath)) {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))
      return pkg.nx ? pkg.name : null
    }
    const parent = dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}

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

  const project = findOwningProject(file)
  if (!project) return

  try {
    execSync(`pnpm exec nx test ${project}`, { stdio: 'inherit' })
  } catch {
    // bukó/hiányzó teszt target nem szabad blokkolja a hookot
  }
})
