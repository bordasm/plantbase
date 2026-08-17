export interface Account {
  id: number
  fullName: string
  salutation: string
  email: string
  role: string
}

async function parseJsonOrThrow(response: Response): Promise<unknown> {
  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    const message = (body as { error?: string }).error ?? 'Ismeretlen hiba történt.'
    throw new Error(message)
  }
  return body
}

export async function register(input: {
  fullName: string
  salutation: string
  email: string
  password: string
  passwordConfirm: string
}): Promise<Account> {
  const response = await fetch('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(input),
  })
  return (await parseJsonOrThrow(response)) as Account
}

export async function login(input: { email: string; password: string }): Promise<Account> {
  const response = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(input),
  })
  return (await parseJsonOrThrow(response)) as Account
}

export async function logout(): Promise<void> {
  await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
}

export async function fetchMe(): Promise<Account | null> {
  const response = await fetch('/api/auth/me', { credentials: 'include' })
  if (response.status === 401) return null
  return (await parseJsonOrThrow(response)) as Account
}
