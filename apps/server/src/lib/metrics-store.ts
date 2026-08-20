import { prisma } from '@plantbase/db'

export interface MetricRatio {
  count: number
  total: number
  percentage: number
}

export interface MetricsSnapshot {
  outOfHours: MetricRatio
  escalationRate: MetricRatio
  totalOrders: number
  totalEscalations: number
}

const BUSINESS_DAY_START_HOUR = 9
const BUSINESS_DAY_END_HOUR = 17

/**
 * Munkaidő: hétfő-péntek 9:00-17:00, helyi (szerver) idő. A 17:00-ás óra
 * maga már NEM munkaidő (a tartomány felül nyitott) -- 16:59 még igen,
 * 17:00 már nem.
 */
export function isBusinessHours(date: Date): boolean {
  const day = date.getDay() // 0 = vasárnap, 6 = szombat
  const hour = date.getHours()
  const isWeekday = day >= 1 && day <= 5
  const isWorkingHour =
    hour >= BUSINESS_DAY_START_HOUR && hour < BUSINESS_DAY_END_HOUR
  return isWeekday && isWorkingHour
}

function toRatio(count: number, total: number): MetricRatio {
  return {
    count,
    total,
    percentage: total === 0 ? 0 : Math.round((count / total) * 1000) / 10,
  }
}

export async function computeMetrics(): Promise<MetricsSnapshot> {
  const [orders, escalations] = await Promise.all([
    prisma.order.findMany({ select: { createdAt: true } }),
    prisma.escalation.findMany({ select: { createdAt: true } }),
  ])

  const totalOrders = orders.length
  const totalEscalations = escalations.length
  const total = totalOrders + totalEscalations

  const outOfHoursCount =
    orders.filter((o) => !isBusinessHours(o.createdAt)).length +
    escalations.filter((e) => !isBusinessHours(e.createdAt)).length

  return {
    outOfHours: toRatio(outOfHoursCount, total),
    escalationRate: toRatio(totalEscalations, total),
    totalOrders,
    totalEscalations,
  }
}
