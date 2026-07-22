import { getReadOnlyPool } from '../db-pool.js'
import { logWarning, type RetrievalTrace } from '../logger.js'
import { embedTexts } from './embed-openai.js'
import { generateHydeDocument } from './hyde.js'
import { rerankChunks } from './rerank.js'

export const ANN_CANDIDATES = 20
export const RERANK_KEEP = 5
export const RERANK_THRESHOLD = 6

export interface KnowledgeChunkResult {
  title: string
  sourceUrl: string
  category: string
  content: string
}

export interface SearchKnowledgeResult {
  found: boolean
  chunks: KnowledgeChunkResult[]
}

export interface SearchKnowledgeOutput {
  result: SearchKnowledgeResult
  trace: RetrievalTrace
}

interface CandidateRow {
  id: number
  title: string
  source_url: string
  category: string
  content: string
}

export async function searchKnowledge(
  query: string,
): Promise<SearchKnowledgeOutput> {
  let hydeText: string
  try {
    hydeText = await generateHydeDocument(query)
  } catch (err) {
    await logWarning({
      timestamp: new Date().toISOString(),
      event: 'hyde_failed',
      message: err instanceof Error ? err.message : String(err),
    })
    hydeText = query
  }

  const [embedding] = await embedTexts([hydeText])
  const vectorLiteral = `[${embedding.join(',')}]`

  const result = await getReadOnlyPool().query<CandidateRow>(
    `SELECT id, title, source_url, category, content
     FROM knowledge_chunks
     ORDER BY embedding <=> $1::vector
     LIMIT $2`,
    [vectorLiteral, ANN_CANDIDATES],
  )
  const candidates = result.rows

  if (candidates.length === 0) {
    return {
      result: { found: false, chunks: [] },
      trace: {
        query,
        hydeText,
        candidateCount: 0,
        scores: [],
        selectedChunkIds: [],
        found: false,
      },
    }
  }

  let scores: { id: number; score: number }[]
  try {
    scores = await rerankChunks(
      query,
      candidates.map((candidate) => ({
        id: candidate.id,
        content: candidate.content,
      })),
    )
  } catch (err) {
    await logWarning({
      timestamp: new Date().toISOString(),
      event: 'rerank_failed',
      message: err instanceof Error ? err.message : String(err),
    })
    scores = candidates.map((candidate, index) => ({
      id: candidate.id,
      score: RERANK_THRESHOLD + (candidates.length - index),
    }))
  }

  const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]))
  const selected = scores
    .filter((score) => score.score >= RERANK_THRESHOLD)
    .sort((a, b) => b.score - a.score)
    .slice(0, RERANK_KEEP)
    .map((score) => byId.get(score.id))
    .filter((candidate): candidate is CandidateRow => candidate !== undefined)

  const trace: RetrievalTrace = {
    query,
    hydeText,
    candidateCount: candidates.length,
    scores,
    selectedChunkIds: selected.map((candidate) => candidate.id),
    found: selected.length > 0,
  }

  if (selected.length === 0) {
    return { result: { found: false, chunks: [] }, trace }
  }

  return {
    result: {
      found: true,
      chunks: selected.map((candidate) => ({
        title: candidate.title,
        sourceUrl: candidate.source_url,
        category: candidate.category,
        content: candidate.content,
      })),
    },
    trace,
  }
}
