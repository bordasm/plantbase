import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadKnowledgeDocuments } from './load-documents.js'

describe('loadKnowledgeDocuments', () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'plantbase-knowledge-'))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('cleans and chunks every markdown file in the directory', async () => {
    await writeFile(
      join(dir, 'sample.md'),
      `---
title: Sample Title
source: https://example.com/sample
category: plants-101
---

# Sample Title

Plants 101

Real content paragraph one.

Real content paragraph two.

## Perfect Pairings For Your Plants

Ignore this.
`,
    )

    const result = await loadKnowledgeDocuments(dir)

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      sourceFile: 'sample.md',
      title: 'Sample Title',
      sourceUrl: 'https://example.com/sample',
      category: 'plants-101',
      chunkIndex: 0,
    })
    expect(result[0].content).toContain('Real content paragraph one.')
    expect(result[0].content).not.toContain('Ignore this')
  })

  it('only reads .md files', async () => {
    await writeFile(join(dir, 'notes.txt'), 'irrelevant')

    const result = await loadKnowledgeDocuments(dir)

    expect(result).toEqual([])
  })
})
