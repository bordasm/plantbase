import Anthropic from '@anthropic-ai/sdk'
import { askAgent } from './ask-agent.js'
import { listCategories } from './list-categories.js'
import { logInteraction } from './logger.js'
import { runSql } from './run-sql.js'

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn(),
}))
vi.mock('./logger.js', () => ({
  logInteraction: vi.fn(),
}))
vi.mock('./run-sql.js', () => ({
  runSql: vi.fn(),
}))
vi.mock('./list-categories.js', () => ({
  listCategories: vi.fn(),
}))

function textResponse(text: string) {
  return {
    stop_reason: 'end_turn',
    content: [{ type: 'text', text }],
    usage: { input_tokens: 10, output_tokens: 5 },
  }
}

function toolUseResponse(name: string, input: unknown) {
  return {
    stop_reason: 'tool_use',
    content: [{ type: 'tool_use', id: 'tool_1', name, input }],
    usage: { input_tokens: 10, output_tokens: 5 },
  }
}

function mockResponses(responses: unknown[]) {
  const create = vi.fn()
  for (const response of responses) create.mockResolvedValueOnce(response)
  vi.mocked(Anthropic).mockImplementation(function AnthropicMock() {
    return { messages: { create } } as never
  })
  return create
}

describe('askAgent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns the answer directly when the model needs no tool', async () => {
    mockResponses([textResponse('42 db van a raktáron.')])

    const result = await askAgent('Hány darab van a raktáron?')

    expect(result.answer).toBe('42 db van a raktáron.')
    expect(result.generatedSql).toEqual([])
    expect(logInteraction).toHaveBeenCalledTimes(1)
  })

  it('runs the runSql tool and feeds the result back for a final answer', async () => {
    vi.mocked(runSql).mockResolvedValue([{ id: 1, name: 'Aloe vera' }])
    mockResponses([
      toolUseResponse('runSql', { query: 'SELECT * FROM products' }),
      textResponse('Egy Aloe vera van.'),
    ])

    const result = await askAgent('Milyen növények vannak?')

    expect(runSql).toHaveBeenCalledWith('SELECT * FROM products')
    expect(result.generatedSql).toEqual(['SELECT * FROM products'])
    expect(result.answer).toBe('Egy Aloe vera van.')
  })

  it('runs the listCategories tool when requested', async () => {
    vi.mocked(listCategories).mockResolvedValue(['Szobanövény'])
    mockResponses([
      toolUseResponse('listCategories', {}),
      textResponse('Egy kategória van: Szobanövény.'),
    ])

    const result = await askAgent('Milyen kategóriák vannak?')

    expect(listCategories).toHaveBeenCalledOnce()
    expect(result.answer).toBe('Egy kategória van: Szobanövény.')
  })

  it('reports an unknown tool back to the model as a tool error and continues', async () => {
    mockResponses([
      toolUseResponse('deleteEverything', {}),
      textResponse('Ezt nem tudom megtenni.'),
    ])

    const result = await askAgent('Törölj mindent.')

    expect(result.answer).toBe('Ezt nem tudom megtenni.')
  })

  it('throws when the tool-use loop never reaches a final answer', async () => {
    vi.mocked(runSql).mockResolvedValue([])
    mockResponses(
      Array.from({ length: 5 }, () =>
        toolUseResponse('runSql', { query: 'SELECT 1' }),
      ),
    )

    await expect(askAgent('Végtelen kör?')).rejects.toThrow(
      'Túl sok tool-use kör',
    )
  })
})
