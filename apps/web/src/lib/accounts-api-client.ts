export interface StaffAccount {
  id: number
  fullName: string
  email: string
  role: string
  anonymizedAt: string | null
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

export async function listStaffAccounts(): Promise<StaffAccount[]> {
  const response = await fetch('/api/staff/accounts', {
    credentials: 'include',
  })
  const body = (await parseJsonOrThrow(response)) as {
    accounts: StaffAccount[]
  }
  return body.accounts
}

export async function anonymizeStaffAccount(accountId: number): Promise<void> {
  const response = await fetch(`/api/staff/accounts/${accountId}/anonymize`, {
    method: 'POST',
    credentials: 'include',
  })
  await parseJsonOrThrow(response)
}
