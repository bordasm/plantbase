export interface StaffOrder {
  orderId: number
  accountId: number
  status: string
  orderDesc: string | null
  price: number | null
  payed: boolean
  email: boolean
  category: string | null
  location: string | null
  light: string | null
  watering: string | null
  currentHeightCm: number | null
  maxHeightCm: number | null
  currentPotCm: number | null
  petSafe: boolean | null
  kidSafe: boolean | null
  airPurifying: boolean | null
  createdAt: string
  updatedAt: string
}

export interface AuditEntry {
  id: number
  accountId: number
  action: string
  previousData: unknown
  newData: unknown
  createdAt: string
}

async function parseJsonOrThrow(response: Response): Promise<unknown> {
  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    const message = (body as { error?: string }).error ?? 'Ismeretlen hiba történt.'
    throw new Error(message)
  }
  return body
}

export async function listStaffOrders(status?: string): Promise<StaffOrder[]> {
  const query = status ? `?status=${encodeURIComponent(status)}` : ''
  const response = await fetch(`/api/staff/orders${query}`, {
    credentials: 'include',
  })
  const body = (await parseJsonOrThrow(response)) as { orders: StaffOrder[] }
  return body.orders
}

export async function getStaffOrder(
  orderId: number,
): Promise<{ order: StaffOrder; auditLog: AuditEntry[] }> {
  const response = await fetch(`/api/staff/orders/${orderId}`, {
    credentials: 'include',
  })
  return (await parseJsonOrThrow(response)) as {
    order: StaffOrder
    auditLog: AuditEntry[]
  }
}

export async function updateStaffOrderStatus(
  orderId: number,
  patch: { status?: string; payed?: boolean },
): Promise<StaffOrder> {
  const response = await fetch(`/api/staff/orders/${orderId}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(patch),
  })
  return (await parseJsonOrThrow(response)) as StaffOrder
}

export async function correctStaffOrder(
  orderId: number,
  patch: Record<string, unknown>,
): Promise<StaffOrder> {
  const response = await fetch(`/api/staff/orders/${orderId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(patch),
  })
  return (await parseJsonOrThrow(response)) as StaffOrder
}
