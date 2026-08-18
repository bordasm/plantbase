import { streamText } from 'ai'
import { streamAgentResponse } from './stream-agent.js'

vi.mock('ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ai')>()
  return { ...actual, streamText: vi.fn(() => ({ mocked: true })) }
})
vi.mock('@ai-sdk/anthropic', () => ({ anthropic: (m: string) => ({ model: m }) }))

describe('streamAgentResponse', () => {
  beforeEach(() => vi.clearAllMocks())

  it('calls streamText with the system prompt, given messages, and the tool set', () => {
    const messages = [{ role: 'user' as const, content: 'Szia' }]

    streamAgentResponse(messages)

    expect(streamText).toHaveBeenCalledOnce()
    const call = vi.mocked(streamText).mock.calls[0][0]
    expect(call.messages).toBe(messages)
    expect(call.system).toContain('Plantbase asszisztens')
    expect(call.tools).toHaveProperty('runSql')
    expect(call.tools).toHaveProperty('listCategories')
    expect(call.tools).toHaveProperty('searchKnowledge')
  })

  it('appends the salutation to the system prompt when provided', () => {
    streamAgentResponse([{ role: 'user' as const, content: 'Szia' }], {
      salutation: 'Kovácsné',
    })

    const call = vi.mocked(streamText).mock.calls[0][0]
    expect(call.system).toContain('Kovácsné')
  })
})
