import { prisma } from '@plantbase/db'
import {
  anonymizeAccount,
  listAccountsForStaff,
} from './accounts-store.js'
import { hashPassword } from './password.js'

vi.mock('./password.js', () => ({ hashPassword: vi.fn() }))

vi.mock('@plantbase/db', () => {
  return {
    prisma: {
      account: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        update: vi.fn(),
      },
      session: {
        deleteMany: vi.fn(),
      },
      $transaction: vi.fn(async (fn: (tx: unknown) => unknown) =>
        fn({
          account: {
            findUnique: vi.fn(),
            update: vi.fn(),
          },
          session: { deleteMany: vi.fn() },
        }),
      ),
    },
  }
})

const NOW = new Date('2026-08-20T10:00:00.000Z')

function fakeAccount(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    fullName: 'Nagy Péter',
    salutation: 'Péter',
    email: 'peter@example.com',
    passwordHash: 'hashed',
    role: 'customer',
    createdAt: NOW,
    anonymizedAt: null,
    ...overrides,
  }
}

describe('anonymizeAccount', () => {
  beforeEach(() => vi.clearAllMocks())

  it('anonymizes an account successfully', async () => {
    vi.mocked(hashPassword).mockResolvedValue('new_hash')
    vi.mocked(prisma.$transaction).mockImplementation(async (fn: unknown) => {
      const tx = {
        account: {
          findUnique: vi.fn().mockResolvedValue(fakeAccount({ id: 5 })),
          update: vi.fn().mockResolvedValue(fakeAccount({ id: 5, anonymizedAt: NOW })),
        },
        session: { deleteMany: vi.fn() },
      }
      return (fn as (t: typeof tx) => unknown)(tx)
    })

    const result = await anonymizeAccount(5)

    expect(result).toBe('ok')
  })

  it('calls account.update with the correct placeholder values', async () => {
    vi.mocked(hashPassword).mockResolvedValue('hashed_random_uuid')
    const update = vi.fn().mockResolvedValue(fakeAccount({ id: 5 }))
    vi.mocked(prisma.$transaction).mockImplementation(async (fn: unknown) => {
      const tx = {
        account: {
          findUnique: vi.fn().mockResolvedValue(fakeAccount({ id: 5 })),
          update,
        },
        session: { deleteMany: vi.fn() },
      }
      return (fn as (t: typeof tx) => unknown)(tx)
    })

    await anonymizeAccount(5)

    expect(update).toHaveBeenCalledWith({
      where: { id: 5 },
      data: {
        fullName: 'Törölt felhasználó #5',
        salutation: 'Ügyfél',
        email: 'anonim-5@plantbase.hu',
        passwordHash: 'hashed_random_uuid',
        anonymizedAt: expect.any(Date),
      },
    })
  })

  it('calls session.deleteMany with the account id', async () => {
    vi.mocked(hashPassword).mockResolvedValue('hashed_random_uuid')
    const deleteMany = vi.fn()
    vi.mocked(prisma.$transaction).mockImplementation(async (fn: unknown) => {
      const tx = {
        account: {
          findUnique: vi.fn().mockResolvedValue(fakeAccount({ id: 5 })),
          update: vi.fn(),
        },
        session: { deleteMany },
      }
      return (fn as (t: typeof tx) => unknown)(tx)
    })

    await anonymizeAccount(5)

    expect(deleteMany).toHaveBeenCalledWith({ where: { accountId: 5 } })
  })

  it('returns not_found for a nonexistent account', async () => {
    vi.mocked(prisma.$transaction).mockImplementation(async (fn: unknown) => {
      const tx = {
        account: {
          findUnique: vi.fn().mockResolvedValue(null),
          update: vi.fn(),
        },
        session: { deleteMany: vi.fn() },
      }
      return (fn as (t: typeof tx) => unknown)(tx)
    })

    const result = await anonymizeAccount(999)

    expect(result).toBe('not_found')
  })

  it('does not call update or deleteMany for a nonexistent account', async () => {
    const update = vi.fn()
    const deleteMany = vi.fn()
    vi.mocked(prisma.$transaction).mockImplementation(async (fn: unknown) => {
      const tx = {
        account: {
          findUnique: vi.fn().mockResolvedValue(null),
          update,
        },
        session: { deleteMany },
      }
      return (fn as (t: typeof tx) => unknown)(tx)
    })

    await anonymizeAccount(999)

    expect(update).not.toHaveBeenCalled()
    expect(deleteMany).not.toHaveBeenCalled()
  })

  it('returns already_anonymized for an already anonymized account', async () => {
    vi.mocked(prisma.$transaction).mockImplementation(async (fn: unknown) => {
      const tx = {
        account: {
          findUnique: vi
            .fn()
            .mockResolvedValue(
              fakeAccount({ id: 5, anonymizedAt: new Date('2026-08-19') }),
            ),
          update: vi.fn(),
        },
        session: { deleteMany: vi.fn() },
      }
      return (fn as (t: typeof tx) => unknown)(tx)
    })

    const result = await anonymizeAccount(5)

    expect(result).toBe('already_anonymized')
  })

  it('does not call update or deleteMany for an already anonymized account', async () => {
    const update = vi.fn()
    const deleteMany = vi.fn()
    vi.mocked(prisma.$transaction).mockImplementation(async (fn: unknown) => {
      const tx = {
        account: {
          findUnique: vi
            .fn()
            .mockResolvedValue(
              fakeAccount({ id: 5, anonymizedAt: new Date('2026-08-19') }),
            ),
          update,
        },
        session: { deleteMany },
      }
      return (fn as (t: typeof tx) => unknown)(tx)
    })

    await anonymizeAccount(5)

    expect(update).not.toHaveBeenCalled()
    expect(deleteMany).not.toHaveBeenCalled()
  })
})

describe('listAccountsForStaff', () => {
  beforeEach(() => vi.clearAllMocks())

  it('calls prisma.account.findMany with correct options', async () => {
    vi.mocked(prisma.account.findMany).mockResolvedValue([])

    await listAccountsForStaff()

    expect(prisma.account.findMany).toHaveBeenCalledWith({
      orderBy: { id: 'asc' },
      select: {
        id: true,
        fullName: true,
        email: true,
        role: true,
        anonymizedAt: true,
      },
    })
  })

  it('returns an empty array when no accounts exist', async () => {
    vi.mocked(prisma.account.findMany).mockResolvedValue([])

    const result = await listAccountsForStaff()

    expect(result).toEqual([])
  })

  it('maps accounts to AccountSummary format with ISO date for anonymizedAt', async () => {
    vi.mocked(prisma.account.findMany).mockResolvedValue([
      fakeAccount({
        id: 1,
        fullName: 'Nagy Péter',
        email: 'peter@example.com',
        role: 'customer',
        anonymizedAt: new Date('2026-08-18T10:00:00.000Z'),
      }),
      fakeAccount({
        id: 2,
        fullName: 'Szabó Anna',
        email: 'anna@example.com',
        role: 'staff',
        anonymizedAt: null,
      }),
    ] as never)

    const result = await listAccountsForStaff()

    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({
      id: 1,
      fullName: 'Nagy Péter',
      email: 'peter@example.com',
      role: 'customer',
      anonymizedAt: '2026-08-18T10:00:00.000Z',
    })
    expect(result[1]).toEqual({
      id: 2,
      fullName: 'Szabó Anna',
      email: 'anna@example.com',
      role: 'staff',
      anonymizedAt: null,
    })
  })

  it('keeps anonymizedAt as null when the date is null', async () => {
    vi.mocked(prisma.account.findMany).mockResolvedValue([
      fakeAccount({
        id: 1,
        fullName: 'Nagy Péter',
        email: 'peter@example.com',
        role: 'customer',
        anonymizedAt: null,
      }),
    ] as never)

    const result = await listAccountsForStaff()

    expect(result[0].anonymizedAt).toBeNull()
  })
})
