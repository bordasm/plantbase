import OpenAI from 'openai'
import { EMBEDDING_MODEL, embedTexts } from './embed-openai.js'

vi.mock('openai', () => ({
  default: vi.fn(),
}))

function mockEmbeddingsCreate(embeddings: number[][]) {
  const create = vi.fn().mockResolvedValue({
    data: embeddings.map((embedding) => ({ embedding })),
  })
  vi.mocked(OpenAI).mockImplementation(function OpenAIMock() {
    return { embeddings: { create } } as never
  })
  return create
}

describe('embedTexts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns one embedding vector per input text', async () => {
    mockEmbeddingsCreate([
      [0.1, 0.2],
      [0.3, 0.4],
    ])

    const result = await embedTexts(['alma', 'körte'])

    expect(result).toEqual([
      [0.1, 0.2],
      [0.3, 0.4],
    ])
  })

  it('calls the OpenAI embeddings endpoint with the configured small model', async () => {
    const create = mockEmbeddingsCreate([[0.1]])

    await embedTexts(['alma'])

    expect(create).toHaveBeenCalledWith({
      model: EMBEDDING_MODEL,
      input: ['alma'],
    })
  })
})
