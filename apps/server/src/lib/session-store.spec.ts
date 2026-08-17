import { prisma } from '@plantbase/db'
import {
  createSession,
  getAccountBySessionToken,
  deleteSession,
} from './session-store.js'

vi.mock('@plantbase/db', () => ({
  prisma: {
    session: {
      create: vi.fn(),
      findUnique: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}))

describe('createSession', () => {
  it('creates a session row with a random token and a 7-day expiry', async () => {
    vi.mocked(prisma.session.create).mockResolvedValue({} as never)

    const { token, expiresAt } = await createSession(42)

    expect(token).toMatch(/^[0-9a-f]{64}$/)
    expect(prisma.session.create).toHaveBeenCalledWith({
      data: { token, accountId: 42, expiresAt },
    })
    const daysAhead = (expiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000)
    expect(daysAhead).toBeGreaterThan(6.9)
    expect(daysAhead).toBeLessThan(7.1)
  })
})

describe('getAccountBySessionToken', () => {
  it('returns the account when the session exists and is not expired', async () => {
    vi.mocked(prisma.session.findUnique).mockResolvedValue({
      token: 'abc',
      expiresAt: new Date(Date.now() + 1000 * 60 * 60),
      account: {
        id: 1,
        fullName: 'Kovács Béla',
        salutation: 'Béla',
        email: 'bela@example.com',
        role: 'customer',
      },
    } as never)

    const account = await getAccountBySessionToken('abc')

    expect(account).toEqual({
      id: 1,
      fullName: 'Kovács Béla',
      salutation: 'Béla',
      email: 'bela@example.com',
      role: 'customer',
    })
  })

  it('returns null when the session does not exist', async () => {
    vi.mocked(prisma.session.findUnique).mockResolvedValue(null)

    await expect(getAccountBySessionToken('missing')).resolves.toBeNull()
  })

  it('returns null when the session is expired', async () => {
    vi.mocked(prisma.session.findUnique).mockResolvedValue({
      token: 'abc',
      expiresAt: new Date(Date.now() - 1000),
      account: {
        id: 1,
        fullName: 'X',
        salutation: 'X',
        email: 'x@example.com',
        role: 'customer',
      },
    } as never)

    await expect(getAccountBySessionToken('abc')).resolves.toBeNull()
  })
})

describe('deleteSession', () => {
  it('deletes the session row by token', async () => {
    vi.mocked(prisma.session.deleteMany).mockResolvedValue({ count: 1 } as never)

    await deleteSession('abc')

    expect(prisma.session.deleteMany).toHaveBeenCalledWith({
      where: { token: 'abc' },
    })
  })
})
