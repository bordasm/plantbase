import { MockLanguageModelV4 } from 'ai/test'
import { askAgent } from './ask-agent.js'
import { logInteraction } from './logger.js'
import { runSql } from './run-sql.js'
import { listCategories } from './list-categories.js'
import { searchKnowledge } from './knowledge/search-knowledge.js'

let mockModel: MockLanguageModelV4

vi.mock('@ai-sdk/anthropic', () => ({
  anthropic: () => mockModel,
}))
vi.mock('./logger.js', () => ({ logInteraction: vi.fn() }))
vi.mock('./run-sql.js', () => ({ runSql: vi.fn() }))
vi.mock('./list-categories.js', () => ({ listCategories: vi.fn() }))
vi.mock('./knowledge/search-knowledge.js', () => ({ searchKnowledge: vi.fn() }))

function textResult(text: string) {
  return {
    finishReason: { unified: 'stop' as const, raw: undefined },
    usage: {
      inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
      outputTokens: { total: 5, text: 5, reasoning: undefined },
    },
    content: [{ type: 'text' as const, text }],
    warnings: [],
  }
}

function toolCallResult(toolName: string, input: unknown, toolCallId = 'call_1') {
  return {
    finishReason: { unified: 'tool-calls' as const, raw: undefined },
    usage: {
      inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
      outputTokens: { total: 5, text: 5, reasoning: undefined },
    },
    content: [
      {
        type: 'tool-call' as const,
        toolCallId,
        toolName,
        input: JSON.stringify(input),
      },
    ],
    warnings: [],
  }
}

function mockGenerateSequence(results: unknown[]) {
  let call = 0
  mockModel = new MockLanguageModelV4({
    doGenerate: async () => results[call++] as never,
  })
}

describe('askAgent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns the answer directly when the model needs no tool', async () => {
    mockGenerateSequence([textResult('42 db van a raktáron.')])

    const result = await askAgent('Hány darab van a raktáron?')

    expect(result.answer).toBe('42 db van a raktáron.')
    expect(result.generatedSql).toEqual([])
    expect(logInteraction).toHaveBeenCalledTimes(1)
  })

  it('runs the runSql tool and feeds the result back for a final answer', async () => {
    vi.mocked(runSql).mockResolvedValue([{ id: 1, name: 'Aloe vera' }])
    mockGenerateSequence([
      toolCallResult('runSql', { query: 'SELECT * FROM products' }),
      textResult('Egy Aloe vera van.'),
    ])

    const result = await askAgent('Milyen növények vannak?')

    expect(runSql).toHaveBeenCalledWith('SELECT * FROM products')
    expect(result.generatedSql).toEqual(['SELECT * FROM products'])
    expect(result.answer).toBe('Egy Aloe vera van.')
  })

  it('runs the listCategories tool when requested', async () => {
    vi.mocked(listCategories).mockResolvedValue(['Szobanövény'])
    mockGenerateSequence([
      toolCallResult('listCategories', {}),
      textResult('Egy kategória van: Szobanövény.'),
    ])

    const result = await askAgent('Milyen kategóriák vannak?')

    expect(listCategories).toHaveBeenCalledOnce()
    expect(result.answer).toBe('Egy kategória van: Szobanövény.')
  })

  it('throws when the tool-use loop never reaches a final answer', async () => {
    vi.mocked(runSql).mockResolvedValue([])
    mockGenerateSequence(
      Array.from({ length: 5 }, (_, i) =>
        toolCallResult('runSql', { query: 'SELECT 1' }, `call_${i}`),
      ),
    )

    await expect(askAgent('Végtelen kör?')).rejects.toThrow(
      'Túl sok tool-use kör',
    )
  })

  it('runs the searchKnowledge tool and threads the retrieval trace into the result', async () => {
    vi.mocked(searchKnowledge).mockResolvedValue({
      result: {
        found: true,
        chunks: [
          {
            title: 'Kaktusz gondozás',
            sourceUrl: 'https://example.com/x',
            category: 'plants-101',
            content: 'öntözés ritkán',
          },
        ],
      },
      trace: {
        query: 'Milyen gyakran öntözzem a kaktuszt?',
        hydeText: 'hipotetikus válasz',
        candidateCount: 3,
        scores: [{ id: 1, score: 9 }],
        selectedChunkIds: [1],
        found: true,
      },
    })
    mockGenerateSequence([
      toolCallResult('searchKnowledge', {
        query: 'Milyen gyakran öntözzem a kaktuszt?',
      }),
      textResult('Ritkán öntözd. Források: Kaktusz gondozás (https://example.com/x)'),
    ])

    const result = await askAgent('Milyen gyakran öntözzem a kaktuszt?')

    expect(searchKnowledge).toHaveBeenCalledWith(
      'Milyen gyakran öntözzem a kaktuszt?',
    )
    expect(result.retrieval).toHaveLength(1)
    expect(result.retrieval[0].found).toBe(true)
    expect(result.answer).toContain('Források')
  })

  it('appends the salutation to the system prompt when provided', async () => {
    mockGenerateSequence([textResult('Szia, Elek!')])

    const result = await askAgent('Szia!', { salutation: 'Elek' })

    expect(result.systemPrompt).toContain('Elek')
  })
})
