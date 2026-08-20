import { prisma } from '@plantbase/db'
import { computeMetrics, isBusinessHours } from './metrics-store.js'

vi.mock('@plantbase/db', () => ({
  prisma: {
    order: { findMany: vi.fn() },
    escalation: { findMany: vi.fn() },
  },
}))

describe('isBusinessHours', () => {
  it('is true for a weekday within 9:00-17:00', () => {
    // 2026.08.17 hétfő 12:00
    expect(isBusinessHours(new Date(2026, 7, 17, 12, 0))).toBe(true)
  })

  it('is true right at the opening hour (9:00)', () => {
    expect(isBusinessHours(new Date(2026, 7, 17, 9, 0))).toBe(true)
  })

  it('is true just before closing (16:59)', () => {
    expect(isBusinessHours(new Date(2026, 7, 21, 16, 59))).toBe(true) // péntek
  })

  it('is false right at closing (17:00)', () => {
    expect(isBusinessHours(new Date(2026, 7, 21, 17, 0))).toBe(false) // péntek
  })

  it('is false on a weekend', () => {
    expect(isBusinessHours(new Date(2026, 7, 22, 12, 0))).toBe(false) // szombat
  })

  it('is false before opening (8:59)', () => {
    expect(isBusinessHours(new Date(2026, 7, 17, 8, 59))).toBe(false)
  })
})

describe('computeMetrics', () => {
  beforeEach(() => vi.clearAllMocks())

  it('computes ratios correctly with a mix of in/out-of-hours orders and escalations', async () => {
    vi.mocked(prisma.order.findMany).mockResolvedValue([
      { createdAt: new Date(2026, 7, 17, 12, 0) }, // hétfő 12:00, munkaidő
      { createdAt: new Date(2026, 7, 22, 12, 0) }, // szombat, nem munkaidő
    ] as never)
    vi.mocked(prisma.escalation.findMany).mockResolvedValue([
      { createdAt: new Date(2026, 7, 17, 20, 0) }, // hétfő este, nem munkaidő
    ] as never)

    const result = await computeMetrics()

    expect(result.totalOrders).toBe(2)
    expect(result.totalEscalations).toBe(1)
    expect(result.outOfHours).toEqual({ count: 2, total: 3, percentage: 66.7 })
    expect(result.escalationRate).toEqual({
      count: 1,
      total: 3,
      percentage: 33.3,
    })
  })

  it('returns 0 percentages, not NaN, when there are no orders or escalations at all', async () => {
    vi.mocked(prisma.order.findMany).mockResolvedValue([] as never)
    vi.mocked(prisma.escalation.findMany).mockResolvedValue([] as never)

    const result = await computeMetrics()

    expect(result.outOfHours).toEqual({ count: 0, total: 0, percentage: 0 })
    expect(result.escalationRate).toEqual({ count: 0, total: 0, percentage: 0 })
    expect(result.totalOrders).toBe(0)
    expect(result.totalEscalations).toBe(0)
  })
})
