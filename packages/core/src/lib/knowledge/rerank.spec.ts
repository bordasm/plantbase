import Anthropic from '@anthropic-ai/sdk'
import { RERANK_MODEL, rerankChunks } from './rerank.js'

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn(),
}))

function mockToolResponse(scores: { id: number; score: number }[]) {
  const create = vi.fn().mockResolvedValue({
    content: [
      {
        type: 'tool_use',
        id: 'tool_1',
        name: 'submitScores',
        input: { scores },
      },
    ],
  })
  vi.mocked(Anthropic).mockImplementation(function AnthropicMock() {
    return { messages: { create } } as never
  })
  return create
}

describe('rerankChunks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns the scores parsed from the submitScores tool call', async () => {
    mockToolResponse([
      { id: 1, score: 8 },
      { id: 2, score: 3 },
    ])

    const result = await rerankChunks('kérdés', [
      { id: 1, content: 'egyik jelölt' },
      { id: 2, content: 'másik jelölt' },
    ])

    expect(result).toEqual([
      { id: 1, score: 8 },
      { id: 2, score: 3 },
    ])
  })

  it('forces the submitScores tool via tool_choice, using the configured rerank model', async () => {
    const create = mockToolResponse([{ id: 1, score: 5 }])

    await rerankChunks('kérdés', [{ id: 1, content: 'jelölt' }])

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        model: RERANK_MODEL,
        tool_choice: { type: 'tool', name: 'submitScores' },
      }),
    )
  })

  it('throws when the model does not call submitScores', async () => {
    const create = vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: 'nem hívom' }],
    })
    vi.mocked(Anthropic).mockImplementation(function AnthropicMock() {
      return { messages: { create } } as never
    })

    await expect(
      rerankChunks('kérdés', [{ id: 1, content: 'x' }]),
    ).rejects.toThrow('nem hívta meg')
  })
})
