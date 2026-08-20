import { streamText } from 'ai'
import { streamAgentResponse } from './stream-agent.js'

vi.mock('ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ai')>()
  return { ...actual, streamText: vi.fn(() => ({ mocked: true })) }
})
vi.mock('@ai-sdk/anthropic', () => ({
  anthropic: (m: string) => ({ model: m }),
}))

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

  it('does not include order tools when orderActions is not provided', () => {
    streamAgentResponse([{ role: 'user' as const, content: 'Szia' }])

    const call = vi.mocked(streamText).mock.calls[0][0]
    expect(call.tools).not.toHaveProperty('createOrder')
  })

  it('includes order tools when orderActions is provided', () => {
    const orderActions = {
      createOrder: vi.fn(),
      cancelOrder: vi.fn(),
      listMyOrders: vi.fn(),
      getOrderByNumber: vi.fn(),
    }
    streamAgentResponse([{ role: 'user' as const, content: 'Szia' }], {
      orderActions,
    })

    const call = vi.mocked(streamText).mock.calls[0][0]
    expect(call.tools).toHaveProperty('createOrder')
    expect(call.tools).toHaveProperty('cancelOrder')
    expect(call.tools).toHaveProperty('listMyOrders')
    expect(call.tools).toHaveProperty('getOrderByNumber')
  })

  it('mentions order capability in the system prompt only when orderActions is provided', () => {
    streamAgentResponse([{ role: 'user' as const, content: 'Szia' }])
    const withoutOrders = vi.mocked(streamText).mock.calls[0][0]
    expect(withoutOrders.system).not.toContain('createOrder')

    vi.clearAllMocks()
    streamAgentResponse([{ role: 'user' as const, content: 'Szia' }], {
      orderActions: {
        createOrder: vi.fn(),
        cancelOrder: vi.fn(),
        listMyOrders: vi.fn(),
        getOrderByNumber: vi.fn(),
      },
    })
    const withOrders = vi.mocked(streamText).mock.calls[0][0]
    expect(withOrders.system).toContain('createOrder')
  })

  it('does not include escalation tools when escalationActions is not provided', () => {
    streamAgentResponse([{ role: 'user' as const, content: 'Szia' }])
    const call = vi.mocked(streamText).mock.calls[0][0]
    expect(call.tools).not.toHaveProperty('escalateToStaff')
  })

  it('includes escalation tools when escalationActions is provided', () => {
    streamAgentResponse([{ role: 'user' as const, content: 'Szia' }], {
      escalationActions: { escalate: vi.fn() },
    })
    const call = vi.mocked(streamText).mock.calls[0][0]
    expect(call.tools).toHaveProperty('escalateToStaff')
  })

  it('mentions escalateToStaff in the system prompt only when escalationActions is provided', () => {
    streamAgentResponse([{ role: 'user' as const, content: 'Szia' }])
    const without = vi.mocked(streamText).mock.calls[0][0]
    expect(without.system).not.toContain('escalateToStaff')

    vi.clearAllMocks()
    streamAgentResponse([{ role: 'user' as const, content: 'Szia' }], {
      escalationActions: { escalate: vi.fn() },
    })
    const withEsc = vi.mocked(streamText).mock.calls[0][0]
    expect(withEsc.system).toContain('escalateToStaff')
  })
})
