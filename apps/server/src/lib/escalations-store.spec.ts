import { prisma } from '@plantbase/db'
import {
  buildEscalationActionsForAccount,
  listEscalationsForStaff,
} from './escalations-store.js'
import { notifyEscalation } from './escalation-emails.js'

vi.mock('./escalation-emails.js', () => ({ notifyEscalation: vi.fn() }))

vi.mock('@plantbase/db', () => {
  return {
    prisma: {
      escalation: {
        create: vi.fn(),
        findMany: vi.fn(),
      },
    },
  }
})

const NOW = new Date('2026-08-18T10:00:00.000Z')

function fakeEscalation(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    accountId: 5,
    summary: 'Ügyfél nem tudja megváltani a terméket',
    createdAt: NOW,
    account: {
      id: 5,
      fullName: 'Nagy Péter',
      salutation: 'Péter',
      email: 'peter@example.com',
      passwordHash: 'hashed',
      role: 'customer',
      createdAt: NOW,
    },
    ...overrides,
  }
}

describe('buildEscalationActionsForAccount', () => {
  beforeEach(() => vi.clearAllMocks())

  it('escalate creates an escalation scoped to the account and returns its id', async () => {
    vi.mocked(prisma.escalation.create).mockResolvedValue(
      fakeEscalation({ id: 42 }) as never,
    )
    const actions = buildEscalationActionsForAccount(5)

    const result = await actions.escalate('Ügyfél nem tudja megváltani')

    expect(result).toEqual({ escalationId: 42 })
  })

  it('escalate calls prisma.escalation.create with accountId and summary', async () => {
    vi.mocked(prisma.escalation.create).mockResolvedValue(
      fakeEscalation({ id: 42 }) as never,
    )
    const actions = buildEscalationActionsForAccount(5)

    await actions.escalate('Ügyfél nem tudja megváltani')

    expect(prisma.escalation.create).toHaveBeenCalledWith({
      data: { accountId: 5, summary: 'Ügyfél nem tudja megváltani' },
    })
  })

  it('escalate notifies with the created escalation id, accountId, and summary', async () => {
    vi.mocked(prisma.escalation.create).mockResolvedValue(
      fakeEscalation({ id: 42 }) as never,
    )
    const actions = buildEscalationActionsForAccount(5)

    await actions.escalate('Ügyfél nem tudja megváltani')

    expect(notifyEscalation).toHaveBeenCalledWith(
      42,
      5,
      'Ügyfél nem tudja megváltani',
    )
  })
})

describe('listEscalationsForStaff', () => {
  beforeEach(() => vi.clearAllMocks())

  it('calls prisma.escalation.findMany with correct options', async () => {
    vi.mocked(prisma.escalation.findMany).mockResolvedValue([] as never)

    await listEscalationsForStaff()

    expect(prisma.escalation.findMany).toHaveBeenCalledWith({
      include: { account: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    })
  })

  it('returns an empty array when no escalations exist', async () => {
    vi.mocked(prisma.escalation.findMany).mockResolvedValue([] as never)

    const result = await listEscalationsForStaff()

    expect(result).toEqual([])
  })

  it('maps escalations to EscalationDetail format with ISO date', async () => {
    vi.mocked(prisma.escalation.findMany).mockResolvedValue(
      [
        fakeEscalation({
          id: 1,
          accountId: 5,
          summary: 'Ügyfél nem tudja megváltani a terméket',
          account: {
            id: 5,
            fullName: 'Nagy Péter',
            salutation: 'Péter',
            email: 'peter@example.com',
            passwordHash: 'hashed',
            role: 'customer',
            createdAt: NOW,
          },
        }),
        fakeEscalation({
          id: 2,
          accountId: 7,
          summary: 'Szállítási probléma',
          account: {
            id: 7,
            fullName: 'Szabó Anna',
            salutation: 'Anna',
            email: 'anna@example.com',
            passwordHash: 'hashed',
            role: 'customer',
            createdAt: NOW,
          },
        }),
      ] as never,
    )

    const result = await listEscalationsForStaff()

    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({
      id: 1,
      accountId: 5,
      accountName: 'Nagy Péter',
      summary: 'Ügyfél nem tudja megváltani a terméket',
      createdAt: '2026-08-18T10:00:00.000Z',
    })
    expect(result[1]).toEqual({
      id: 2,
      accountId: 7,
      accountName: 'Szabó Anna',
      summary: 'Szállítási probléma',
      createdAt: '2026-08-18T10:00:00.000Z',
    })
  })
})
