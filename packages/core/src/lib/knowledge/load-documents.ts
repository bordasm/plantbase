import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { chunkText } from './chunk.js'
import { cleanDocument } from './clean.js'

export interface PendingChunk {
  sourceFile: string
  title: string
  sourceUrl: string
  category: string
  chunkIndex: number
  content: string
}

export async function loadKnowledgeDocuments(
  dir: string,
): Promise<PendingChunk[]> {
  const files = (await readdir(dir)).filter((file) => file.endsWith('.md'))
  const pending: PendingChunk[] = []

  for (const file of files) {
    const raw = await readFile(join(dir, file), 'utf-8')
    const cleaned = cleanDocument(raw)
    const chunks = chunkText(cleaned.body)
    chunks.forEach((content, chunkIndex) => {
      pending.push({
        sourceFile: file,
        title: cleaned.title,
        sourceUrl: cleaned.sourceUrl,
        category: cleaned.category,
        chunkIndex,
        content,
      })
    })
  }
  return pending
}
