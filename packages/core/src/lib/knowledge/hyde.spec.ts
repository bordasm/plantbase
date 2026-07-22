import OpenAI from 'openai'
import { HYDE_MODEL, generateHydeDocument } from './hyde.js'

vi.mock('openai', () => ({
  default: vi.fn(),
}))

function mockChatCompletion(text: string | undefined) {
  const create = vi.fn().mockResolvedValue({
    choices: [{ message: { content: text } }],
  })
  vi.mocked(OpenAI).mockImplementation(function OpenAIMock() {
    return { chat: { completions: { create } } } as never
  })
  return create
}

describe('generateHydeDocument', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns the generated hypothetical answer text', async () => {
    mockChatCompletion('A pozsgásokat ritkán kell öntözni.')

    const result = await generateHydeDocument(
      'Milyen gyakran öntözzem a pozsgásokat?',
    )

    expect(result).toBe('A pozsgásokat ritkán kell öntözni.')
  })

  it('calls the chat completions endpoint with the configured HyDE model', async () => {
    const create = mockChatCompletion('válasz')

    await generateHydeDocument('kérdés')

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ model: HYDE_MODEL }),
    )
  })

  it('falls back to the original question if the model returns no content', async () => {
    mockChatCompletion(undefined)

    const result = await generateHydeDocument('eredeti kérdés')

    expect(result).toBe('eredeti kérdés')
  })
})
