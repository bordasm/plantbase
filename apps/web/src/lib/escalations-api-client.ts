export interface StaffEscalation {
  id: number
  accountId: number
  accountName: string
  summary: string
  createdAt: string
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

export async function listStaffEscalations(): Promise<StaffEscalation[]> {
  const response = await fetch('/api/staff/escalations', {
    credentials: 'include',
  })
  const body = (await parseJsonOrThrow(response)) as {
    escalations: StaffEscalation[]
  }
  return body.escalations
}
