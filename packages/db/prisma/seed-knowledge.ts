// Plantbase — tudásbázis (knowledge_chunks) betöltő script.
// Egyszeri (újrafuttatható) betöltő: seed/knowledge/*.md -> tisztítás -> chunkolás ->
// embedding -> knowledge_chunks tábla.
// Futtatás (a packages/db könyvtárból): `npx tsx prisma/seed-knowledge.ts`
// Előfeltétel: `npx nx build core` (a @plantbase/core dist kimenetét használja),
// és a knowledge_chunks migráció már alkalmazva van.

import { join } from 'node:path'
import { embedTexts, loadKnowledgeDocuments } from '@plantbase/core'
import { PrismaClient } from '@prisma/client'

const KNOWLEDGE_DIR = join(process.cwd(), '../../seed/knowledge')
const BATCH_SIZE = 50

const prisma = new PrismaClient()

async function main() {
  const pending = await loadKnowledgeDocuments(KNOWLEDGE_DIR)
  await prisma.$executeRaw`DELETE FROM knowledge_chunks` // idempotens újraseedeléshez

  let inserted = 0
  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const batch = pending.slice(i, i + BATCH_SIZE)
    const embeddings = await embedTexts(batch.map((chunk) => chunk.content))

    for (const [index, chunk] of batch.entries()) {
      const vectorLiteral = `[${embeddings[index].join(',')}]`
      await prisma.$executeRaw`
        INSERT INTO knowledge_chunks (source_file, title, source_url, category, chunk_index, content, embedding)
        VALUES (${chunk.sourceFile}, ${chunk.title}, ${chunk.sourceUrl}, ${chunk.category}, ${chunk.chunkIndex}, ${chunk.content}, ${vectorLiteral}::vector)
      `
      inserted++
    }
  }

  const documentCount = new Set(pending.map((chunk) => chunk.sourceFile)).size
  console.log(
    `Tudásbázis betöltve: ${inserted} chunk, ${documentCount} dokumentumból.`,
  )
}

main()
  .catch((e) => {
    console.error('Tudásbázis-seed hiba:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
