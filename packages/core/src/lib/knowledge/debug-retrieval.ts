// Ideiglenes debug script -- NEM része a terméknek/tervnek, csak a HyDE+rerank
// pipeline és a nyers vektortávolság-keresés összehasonlítására.
// Futtatás (repo gyökérből): npx tsx packages/core/src/lib/knowledge/debug-retrieval.ts "kérdés"

import { getReadOnlyPool } from '../db-pool.js'
import { embedTexts } from './embed-openai.js'
import { searchKnowledge } from './search-knowledge.js'

try {
  process.loadEnvFile()
} catch (err) {
  if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
}

const query = process.argv[2] ?? 'Milyen gyakran öntözzem a kaktuszaimat?'

interface Row {
  id: number
  title: string
  source_url: string
  content: string
  distance: number
}

async function pureVectorSearch(q: string, limit = 5): Promise<Row[]> {
  const [embedding] = await embedTexts([q])
  const vectorLiteral = `[${embedding.join(',')}]`
  const result = await getReadOnlyPool().query<Row>(
    `SELECT id, title, source_url, content, embedding <=> $1::vector AS distance
     FROM knowledge_chunks
     ORDER BY embedding <=> $1::vector
     LIMIT $2`,
    [vectorLiteral, limit],
  )
  return result.rows
}

function preview(text: string): string {
  return text.slice(0, 150).replace(/\s+/g, ' ').trim()
}

async function main() {
  console.log(`\n=== Kérdés: "${query}" ===\n`)

  console.log('--- 1) Nyers vektortávolság (a kérdés közvetlen embeddingje, HyDE és rerank NÉLKÜL) ---')
  const pure = await pureVectorSearch(query)
  pure.forEach((row, i) => {
    console.log(`${i + 1}. [cosine dist=${row.distance.toFixed(4)}] ${row.title}`)
    console.log(`   ${preview(row.content)}...`)
  })

  console.log('\n--- 2) HyDE + rerank pipeline (searchKnowledge, ahogy az agent ténylegesen hívja) ---')
  const { result, trace } = await searchKnowledge(query)
  console.log(`HyDE-generált hipotetikus szöveg: "${trace.hydeText}"`)
  console.log(`ANN jelöltek száma: ${trace.candidateCount}`)
  console.log(`Rerank pontszámok (id, score): ${JSON.stringify(trace.scores)}`)
  console.log(`Kiválasztott chunk id-k (küszöb+cap után): ${JSON.stringify(trace.selectedChunkIds)}`)
  console.log(`found: ${result.found}\n`)
  result.chunks.forEach((chunk, i) => {
    console.log(`${i + 1}. ${chunk.title}`)
    console.log(`   ${preview(chunk.content)}...`)
  })
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
