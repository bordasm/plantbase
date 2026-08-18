import { prisma } from '@plantbase/db'
import {
  buildOrderActionsForAccount,
  listOrdersForStaff,
  getOrderForStaff,
  updateOrderStatus,
  correctOrder,
} from './orders-store.js'

vi.mock('@plantbase/db', () => ({
  prisma: {
    order: {
      create: vi.fn(),
      update: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    orderAuditLog: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) =>
      fn({
        order: {
          create: vi.fn(),
          update: vi.fn(),
        },
        orderAuditLog: { create: vi.fn() },
      }),
    ),
  },
}))

const NOW = new Date('2026-08-18T10:00:00.000Z')

function fakeOrder(overrides: Record<string, unknown> = {}) {
  return {
    orderId: 1,
    accountId: 5,
    status: 'új',
    orderDesc: 'Egy kaktusz',
    price: 4990,
    payed: false,
    email: true,
    category: 'kaktusz',
    location: null,
    light: null,
    watering: null,
    currentHeightCm: null,
    maxHeightCm: null,
    currentPotCm: null,
    petSafe: null,
    kidSafe: null,
    airPurifying: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  }
}

describe('buildOrderActionsForAccount', () => {
  beforeEach(() => vi.clearAllMocks())

  it('createOrder creates an order scoped to the account and returns its id', async () => {
    vi.mocked(prisma.$transaction).mockImplementation(async (fn: unknown) => {
      const tx = {
        order: {
          create: vi.fn().mockResolvedValue(fakeOrder({ orderId: 42 })),
        },
        orderAuditLog: { create: vi.fn() },
      }
      return (fn as (t: typeof tx) => unknown)(tx)
    })
    const actions = buildOrderActionsForAccount(5)

    const result = await actions.createOrder({
      email: true,
      category: 'kaktusz',
    })

    expect(result).toEqual({ orderId: 42 })
  })

  it('cancelOrder refuses to cancel an order belonging to another account', async () => {
    vi.mocked(prisma.$transaction).mockImplementation(async (fn: unknown) => {
      const tx = {
        order: {
          findUnique: vi.fn().mockResolvedValue(fakeOrder({ accountId: 999 })),
          update: vi.fn(),
        },
        orderAuditLog: { create: vi.fn() },
      }
      return (fn as (t: typeof tx) => unknown)(tx)
    })
    const actions = buildOrderActionsForAccount(5)

    const result = await actions.cancelOrder(1)

    expect(result).toEqual({
      ok: false,
      reason: 'Nem található ilyen rendelés.',
    })
  })

  it('cancelOrder refuses to cancel an already completed order', async () => {
    vi.mocked(prisma.$transaction).mockImplementation(async (fn: unknown) => {
      const tx = {
        order: {
          findUnique: vi
            .fn()
            .mockResolvedValue(fakeOrder({ status: 'teljesítve' })),
          update: vi.fn(),
        },
        orderAuditLog: { create: vi.fn() },
      }
      return (fn as (t: typeof tx) => unknown)(tx)
    })
    const actions = buildOrderActionsForAccount(5)

    const result = await actions.cancelOrder(1)

    expect(result).toEqual({
      ok: false,
      reason: 'Ez a rendelés már nem mondható le.',
    })
  })

  it('cancelOrder cancels an own new/in-progress order', async () => {
    vi.mocked(prisma.$transaction).mockImplementation(async (fn: unknown) => {
      const tx = {
        order: {
          findUnique: vi.fn().mockResolvedValue(fakeOrder()),
          update: vi.fn().mockResolvedValue(fakeOrder({ status: 'lemondva' })),
        },
        orderAuditLog: { create: vi.fn() },
      }
      return (fn as (t: typeof tx) => unknown)(tx)
    })
    const actions = buildOrderActionsForAccount(5)

    const result = await actions.cancelOrder(1)

    expect(result).toEqual({ ok: true })
  })

  it('cancelOrder reads the current order inside the transaction (not before it)', async () => {
    // Ha a lekérdezés a tranzakción kívül, `prisma.order.findUnique`-on
    // keresztül történne, ez a régi, más account_id-hoz tartozó sort adná
    // vissza, és a lemondás tévesen sikerülne. A helyes viselkedés csak a
    // tranzakción belüli, friss `tx.order.findUnique` sort veheti figyelembe.
    vi.mocked(prisma.order.findUnique).mockResolvedValue(fakeOrder() as never)
    vi.mocked(prisma.$transaction).mockImplementation(async (fn: unknown) => {
      const tx = {
        order: {
          findUnique: vi
            .fn()
            .mockResolvedValue(fakeOrder({ status: 'teljesítve' })),
          update: vi.fn(),
        },
        orderAuditLog: { create: vi.fn() },
      }
      return (fn as (t: typeof tx) => unknown)(tx)
    })
    const actions = buildOrderActionsForAccount(5)

    const result = await actions.cancelOrder(1)

    expect(result).toEqual({
      ok: false,
      reason: 'Ez a rendelés már nem mondható le.',
    })
    expect(prisma.order.findUnique).not.toHaveBeenCalled()
  })

  it('listMyOrders only returns orders for the given account and caps at 5', async () => {
    vi.mocked(prisma.order.findMany).mockResolvedValue(
      Array.from({ length: 6 }, (_, i) =>
        fakeOrder({ orderId: i + 1 }),
      ) as never,
    )
    const actions = buildOrderActionsForAccount(5)

    const result = await actions.listMyOrders('all')

    expect(prisma.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { accountId: 5 } }),
    )
    expect(result.orders).toHaveLength(5)
    expect(result.tooMany).toBe(true)
  })

  it('listMyOrders with scope active filters by status', async () => {
    vi.mocked(prisma.order.findMany).mockResolvedValue([fakeOrder()] as never)
    const actions = buildOrderActionsForAccount(5)

    await actions.listMyOrders('active')

    expect(prisma.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { accountId: 5, status: { in: ['új', 'folyamatban'] } },
      }),
    )
  })

  it('getOrderByNumber returns null for an order belonging to another account', async () => {
    vi.mocked(prisma.order.findUnique).mockResolvedValue(
      fakeOrder({ accountId: 999 }) as never,
    )
    const actions = buildOrderActionsForAccount(5)

    const result = await actions.getOrderByNumber(1)

    expect(result).toBeNull()
  })

  it("getOrderByNumber returns the summary for the caller's own order", async () => {
    vi.mocked(prisma.order.findUnique).mockResolvedValue(fakeOrder() as never)
    const actions = buildOrderActionsForAccount(5)

    const result = await actions.getOrderByNumber(1)

    expect(result).toEqual(
      expect.objectContaining({ orderId: 1, status: 'új' }),
    )
  })
})

describe('staff functions', () => {
  beforeEach(() => vi.clearAllMocks())

  it('listOrdersForStaff returns all orders when no status filter given', async () => {
    vi.mocked(prisma.order.findMany).mockResolvedValue([fakeOrder()] as never)

    const result = await listOrdersForStaff()

    expect(prisma.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: undefined }),
    )
    expect(result).toHaveLength(1)
  })

  it('getOrderForStaff returns null for a nonexistent order', async () => {
    vi.mocked(prisma.order.findUnique).mockResolvedValue(null)

    const result = await getOrderForStaff(999)

    expect(result).toBeNull()
  })

  it('getOrderForStaff returns the order and its audit log', async () => {
    vi.mocked(prisma.order.findUnique).mockResolvedValue(fakeOrder() as never)
    vi.mocked(prisma.orderAuditLog.findMany).mockResolvedValue([
      {
        id: 1,
        orderId: 1,
        accountId: 5,
        action: 'created',
        previousData: null,
        newData: fakeOrder(),
        createdAt: NOW,
      },
    ] as never)

    const result = await getOrderForStaff(1)

    expect(result?.order.orderId).toBe(1)
    expect(result?.auditLog).toHaveLength(1)
  })

  it('updateOrderStatus writes an audit entry and returns the updated order', async () => {
    vi.mocked(prisma.$transaction).mockImplementation(async (fn: unknown) => {
      const tx = {
        order: {
          findUnique: vi.fn().mockResolvedValue(fakeOrder()),
          update: vi
            .fn()
            .mockResolvedValue(fakeOrder({ status: 'teljesítve' })),
        },
        orderAuditLog: { create: vi.fn() },
      }
      return (fn as (t: typeof tx) => unknown)(tx)
    })

    const result = await updateOrderStatus(9, 1, { status: 'teljesítve' })

    expect(result?.status).toBe('teljesítve')
  })

  it('updateOrderStatus returns null for a nonexistent order without writing an audit entry', async () => {
    const auditCreate = vi.fn()
    vi.mocked(prisma.$transaction).mockImplementation(async (fn: unknown) => {
      const tx = {
        order: {
          findUnique: vi.fn().mockResolvedValue(null),
          update: vi.fn(),
        },
        orderAuditLog: { create: auditCreate },
      }
      return (fn as (t: typeof tx) => unknown)(tx)
    })

    const result = await updateOrderStatus(9, 999, { status: 'teljesítve' })

    expect(result).toBeNull()
    expect(auditCreate).not.toHaveBeenCalled()
  })

  it('correctOrder writes an audit entry and returns the updated order', async () => {
    vi.mocked(prisma.$transaction).mockImplementation(async (fn: unknown) => {
      const tx = {
        order: {
          findUnique: vi.fn().mockResolvedValue(fakeOrder()),
          update: vi
            .fn()
            .mockResolvedValue(fakeOrder({ orderDesc: 'Javított leírás' })),
        },
        orderAuditLog: { create: vi.fn() },
      }
      return (fn as (t: typeof tx) => unknown)(tx)
    })

    const result = await correctOrder(9, 1, { orderDesc: 'Javított leírás' })

    expect(result?.orderDesc).toBe('Javított leírás')
  })

  it('correctOrder returns null for a nonexistent order without writing an audit entry', async () => {
    const auditCreate = vi.fn()
    vi.mocked(prisma.$transaction).mockImplementation(async (fn: unknown) => {
      const tx = {
        order: {
          findUnique: vi.fn().mockResolvedValue(null),
          update: vi.fn(),
        },
        orderAuditLog: { create: auditCreate },
      }
      return (fn as (t: typeof tx) => unknown)(tx)
    })

    const result = await correctOrder(9, 999, { orderDesc: 'x' })

    expect(result).toBeNull()
    expect(auditCreate).not.toHaveBeenCalled()
  })
})
