import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SYSTEM_PROMPT } from './system-prompt.js'

const DOCS_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../docs/system-prompt.md',
)

function extractXmlBlock(markdown: string): string {
  const match = markdown.match(/```xml\n([\s\S]*?)```/)
  if (!match) {
    throw new Error('No ```xml fenced block found in docs/system-prompt.md')
  }
  return match[1].replace(/\n$/, '')
}

describe('SYSTEM_PROMPT', () => {
  it('is wrapped in the documented top-level XML sections', () => {
    expect(SYSTEM_PROMPT.startsWith('<role>')).toBe(true)
    expect(SYSTEM_PROMPT.endsWith('</tools>')).toBe(true)

    for (const tag of ['role', 'task', 'schema', 'rules', 'behavior', 'tools']) {
      expect(SYSTEM_PROMPT).toContain(`<${tag}>`)
      expect(SYSTEM_PROMPT).toContain(`</${tag}>`)
    }
  })

  it('mentions both tools that askAgent actually registers', () => {
    expect(SYSTEM_PROMPT).toContain('runSql')
    expect(SYSTEM_PROMPT).toContain('listCategories')
  })

  it('is a verbatim copy of the ```xml block in docs/system-prompt.md', () => {
    const docs = readFileSync(DOCS_PATH, 'utf-8')

    expect(SYSTEM_PROMPT).toBe(extractXmlBlock(docs))
  })
})
