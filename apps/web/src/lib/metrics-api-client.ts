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

async function parseJsonOrThrow(response: Response): Promise<unknown> {
  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    const message =
      (body as { error?: string }).error ?? 'Ismeretlen hiba történt.'
    throw new Error(message)
  }
  return body
}

export async function getStaffMetrics(): Promise<MetricsSnapshot> {
  const response = await fetch('/api/staff/metrics', {
    credentials: 'include',
  })
  return (await parseJsonOrThrow(response)) as MetricsSnapshot
}
