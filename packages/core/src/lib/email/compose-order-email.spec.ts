import { generateObject } from 'ai'
import { composeOrderEmail } from './compose-order-email.js'

vi.mock('ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ai')>()
  return { ...actual, generateObject: vi.fn() }
})
vi.mock('@ai-sdk/anthropic', () => ({
  anthropic: (m: string) => ({ model: m }),
}))

const order = {
  orderId: 42,
  status: 'új',
  orderDesc: 'Aranylabda kaktusz',
  price: 3500,
}
const account = { fullName: 'Kovács Béla', salutation: 'Uram' }

describe('composeOrderEmail', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns the LLM-generated subject and body on success', async () => {
    vi.mocked(generateObject).mockResolvedValue({
      object: { subject: 'Rendelés visszaigazolás', body: 'Kedves Uram!' },
    } as never)

    const result = await composeOrderEmail(order, account, 'created')

    expect(result).toEqual({
      subject: 'Rendelés visszaigazolás',
      body: 'Kedves Uram!',
    })
  })

  it('passes the order/account/event details in the prompt', async () => {
    vi.mocked(generateObject).mockResolvedValue({
      object: { subject: 'S', body: 'B' },
    } as never)

    await composeOrderEmail(order, account, 'status_changed')

    const call = vi.mocked(generateObject).mock.calls[0][0]
    expect(call.prompt).toContain('42')
    expect(call.prompt).toContain('Kovács Béla')
    expect(call.prompt).toContain('Uram')
  })

  it('falls back to a deterministic Hungarian template when the LLM call fails', async () => {
    vi.mocked(generateObject).mockRejectedValue(new Error('timeout'))

    const result = await composeOrderEmail(order, account, 'cancelled')

    expect(result.subject).toContain('#42')
    expect(result.body).toContain('Uram')
    expect(result.body).toContain('lemondta')
  })

  it('logs the LLM error before falling back to the template', async () => {
    const llmError = new Error('provider outage')
    vi.mocked(generateObject).mockRejectedValue(llmError)
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await composeOrderEmail(order, account, 'created')

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('LLM-hiba'),
      llmError,
    )
    consoleSpy.mockRestore()
  })

  it('fallback template includes price and description when present', async () => {
    vi.mocked(generateObject).mockRejectedValue(new Error('fail'))

    const result = await composeOrderEmail(order, account, 'created')

    expect(result.body).toContain('Aranylabda kaktusz')
    expect(result.body).toContain('3500')
  })

  it('fallback template handles missing description/price gracefully', async () => {
    vi.mocked(generateObject).mockRejectedValue(new Error('fail'))

    const result = await composeOrderEmail(
      { orderId: 7, status: 'folyamatban', orderDesc: null, price: null },
      account,
      'status_changed',
    )

    expect(result.subject).toContain('#7')
    expect(result.body).not.toContain('null')
  })
})
