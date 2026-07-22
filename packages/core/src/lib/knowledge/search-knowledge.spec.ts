import { getReadOnlyPool } from '../db-pool.js'
import { logWarning } from '../logger.js'
import { embedTexts } from './embed-openai.js'
import { generateHydeDocument } from './hyde.js'
import { rerankChunks } from './rerank.js'
import { searchKnowledge } from './search-knowledge.js'

vi.mock('../db-pool.js', () => ({ getReadOnlyPool: vi.fn() }))
vi.mock('../logger.js', () => ({ logWarning: vi.fn() }))
vi.mock('./embed-openai.js', () => ({ embedTexts: vi.fn() }))
vi.mock('./hyde.js', () => ({ generateHydeDocument: vi.fn() }))
vi.mock('./rerank.js', () => ({ rerankChunks: vi.fn() }))

function mockCandidates(
  rows: {
    id: number
    title: string
    source_url: string
    category: string
    content: string
  }[],
) {
  const query = vi.fn().mockResolvedValue({ rows })
  vi.mocked(getReadOnlyPool).mockReturnValue({ query } as never)
  return query
}

describe('searchKnowledge', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(generateHydeDocument).mockResolvedValue('hipotetikus válasz')
    vi.mocked(embedTexts).mockResolvedValue([[0.1, 0.2]])
  })

  it('returns found:false when there are no ANN candidates', async () => {
    mockCandidates([])

    const { result, trace } = await searchKnowledge('öntözés?')

    expect(result).toEqual({ found: false, chunks: [] })
    expect(trace.candidateCount).toBe(0)
  })

  it('keeps only candidates scoring at or above the threshold, best first, capped at 5', async () => {
    mockCandidates([
      {
        id: 1,
        title: 'A',
        source_url: 'urlA',
        category: 'plants-101',
        content: 'contentA',
      },
      {
        id: 2,
        title: 'B',
        source_url: 'urlB',
        category: 'plants-101',
        content: 'contentB',
      },
      {
        id: 3,
        title: 'C',
        source_url: 'urlC',
        category: 'plants-101',
        content: 'contentC',
      },
    ])
    vi.mocked(rerankChunks).mockResolvedValue([
      { id: 1, score: 4 },
      { id: 2, score: 9 },
      { id: 3, score: 7 },
    ])

    const { result } = await searchKnowledge('öntözés?')

    expect(result.found).toBe(true)
    expect(result.chunks.map((chunk) => chunk.title)).toEqual(['B', 'C'])
  })

  it('returns found:false when every candidate scores below the threshold', async () => {
    mockCandidates([
      {
        id: 1,
        title: 'A',
        source_url: 'urlA',
        category: 'plants-101',
        content: 'x',
      },
    ])
    vi.mocked(rerankChunks).mockResolvedValue([{ id: 1, score: 2 }])

    const { result } = await searchKnowledge('öntözés?')

    expect(result).toEqual({ found: false, chunks: [] })
  })

  it('falls back to the raw question embedding when HyDE fails, and logs a warning', async () => {
    vi.mocked(generateHydeDocument).mockRejectedValue(new Error('timeout'))
    const query = mockCandidates([])

    await searchKnowledge('öntözés?')

    expect(embedTexts).toHaveBeenCalledWith(['öntözés?'])
    expect(logWarning).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'hyde_failed' }),
    )
    expect(query).toHaveBeenCalled()
  })

  it('falls back to ANN order when rerank fails, and logs a warning', async () => {
    mockCandidates([
      {
        id: 1,
        title: 'A',
        source_url: 'urlA',
        category: 'plants-101',
        content: 'x',
      },
    ])
    vi.mocked(rerankChunks).mockRejectedValue(new Error('rerank down'))

    const { result } = await searchKnowledge('öntözés?')

    expect(result.found).toBe(true)
    expect(result.chunks[0].title).toBe('A')
    expect(logWarning).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'rerank_failed' }),
    )
  })
})
