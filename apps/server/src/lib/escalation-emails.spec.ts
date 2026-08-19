import { prisma } from '@plantbase/db'
import { sendSimulatedEmail } from '@plantbase/core'
import { notifyEscalation } from './escalation-emails.js'

vi.mock('@plantbase/db', () => ({
  prisma: { account: { findUnique: vi.fn() } },
}))
vi.mock('@plantbase/core', () => ({
  sendSimulatedEmail: vi.fn(),
}))

const account = {
  id: 5,
  fullName: 'Kovács Béla',
  salutation: 'Uram',
  email: 'bela@example.com',
}

async function flushMicrotasks(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve))
}

describe('notifyEscalation', () => {
  beforeEach(() => vi.clearAllMocks())

  it('looks up the account and sends a deterministic email, no LLM call', async () => {
    vi.mocked(prisma.account.findUnique).mockResolvedValue(account as never)
    vi.mocked(sendSimulatedEmail).mockResolvedValue({ filePath: '/x' })

    notifyEscalation(
      42,
      5,
      'Az ügyfél egy funkciót kér, ami nincs a katalógusban.',
    )
    await flushMicrotasks()

    expect(prisma.account.findUnique).toHaveBeenCalledWith({
      where: { id: 5 },
    })
    expect(sendSimulatedEmail).toHaveBeenCalledWith({
      recipientLabel: 'ügyfélszolgálat',
      recipientAddress: 'ugyfelszolgalat@plantbase.hu',
      subject: expect.stringContaining('#42'),
      body: expect.stringContaining(
        'Az ügyfél egy funkciót kér, ami nincs a katalógusban.',
      ),
    })
  })

  it('email body includes the account contact info and the escalation id', async () => {
    vi.mocked(prisma.account.findUnique).mockResolvedValue(account as never)
    vi.mocked(sendSimulatedEmail).mockResolvedValue({ filePath: '/x' })

    notifyEscalation(42, 5, 'Összefoglaló.')
    await flushMicrotasks()

    const call = vi.mocked(sendSimulatedEmail).mock.calls[0][0]
    expect(call.body).toContain('Kovács Béla')
    expect(call.body).toContain('bela@example.com')
    expect(call.body).toContain('#42')
  })

  it('does nothing if the account is not found', async () => {
    vi.mocked(prisma.account.findUnique).mockResolvedValue(null)

    notifyEscalation(42, 999, 'Összefoglaló.')
    await flushMicrotasks()

    expect(sendSimulatedEmail).not.toHaveBeenCalled()
  })

  it('never throws back to the caller when sendSimulatedEmail rejects', async () => {
    vi.mocked(prisma.account.findUnique).mockResolvedValue(account as never)
    vi.mocked(sendSimulatedEmail).mockRejectedValue(new Error('disk full'))
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(() => notifyEscalation(42, 5, 'Összefoglaló.')).not.toThrow()
    await flushMicrotasks()

    expect(consoleSpy).toHaveBeenCalled()
    consoleSpy.mockRestore()
  })
})
