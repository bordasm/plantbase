import { prisma } from '@plantbase/db'
import { composeOrderEmail, sendSimulatedEmail } from '@plantbase/core'
import { notifyOrderEvent } from './order-emails.js'

vi.mock('@plantbase/db', () => ({
  prisma: { account: { findUnique: vi.fn() } },
}))
vi.mock('@plantbase/core', () => ({
  composeOrderEmail: vi.fn(),
  sendSimulatedEmail: vi.fn(),
}))

const order = { orderId: 1, status: 'új', orderDesc: 'Teszt', price: 1000 }
const account = {
  id: 5,
  fullName: 'Kovács Béla',
  salutation: 'Uram',
  email: 'bela@example.com',
}

async function flushMicrotasks(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve))
}

describe('notifyOrderEvent', () => {
  beforeEach(() => vi.clearAllMocks())

  it('looks up the account, composes, and sends the email', async () => {
    vi.mocked(prisma.account.findUnique).mockResolvedValue(account as never)
    vi.mocked(composeOrderEmail).mockResolvedValue({
      subject: 'S',
      body: 'B',
    })
    vi.mocked(sendSimulatedEmail).mockResolvedValue({ filePath: '/x' })

    notifyOrderEvent(order, 5, 'created')
    await flushMicrotasks()

    expect(prisma.account.findUnique).toHaveBeenCalledWith({
      where: { id: 5 },
    })
    expect(composeOrderEmail).toHaveBeenCalledWith(
      order,
      { fullName: 'Kovács Béla', salutation: 'Uram' },
      'created',
    )
    expect(sendSimulatedEmail).toHaveBeenCalledWith({
      recipientLabel: 'Kovács Béla',
      recipientAddress: 'bela@example.com',
      subject: 'S',
      body: 'B',
    })
  })

  it('does nothing if the account is not found', async () => {
    vi.mocked(prisma.account.findUnique).mockResolvedValue(null)

    notifyOrderEvent(order, 999, 'created')
    await flushMicrotasks()

    expect(composeOrderEmail).not.toHaveBeenCalled()
    expect(sendSimulatedEmail).not.toHaveBeenCalled()
  })

  it('never throws back to the caller when composeOrderEmail rejects', async () => {
    vi.mocked(prisma.account.findUnique).mockResolvedValue(account as never)
    vi.mocked(composeOrderEmail).mockRejectedValue(new Error('boom'))
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(() => notifyOrderEvent(order, 5, 'created')).not.toThrow()
    await flushMicrotasks()

    expect(sendSimulatedEmail).not.toHaveBeenCalled()
    expect(consoleSpy).toHaveBeenCalled()
    consoleSpy.mockRestore()
  })

  it('never throws back to the caller when sendSimulatedEmail rejects', async () => {
    vi.mocked(prisma.account.findUnique).mockResolvedValue(account as never)
    vi.mocked(composeOrderEmail).mockResolvedValue({ subject: 'S', body: 'B' })
    vi.mocked(sendSimulatedEmail).mockRejectedValue(new Error('disk full'))
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(() => notifyOrderEvent(order, 5, 'created')).not.toThrow()
    await flushMicrotasks()

    expect(consoleSpy).toHaveBeenCalled()
    consoleSpy.mockRestore()
  })
})
