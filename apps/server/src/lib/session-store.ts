import { randomBytes } from 'node:crypto'
import { prisma } from '@plantbase/db'

const SESSION_TTL_DAYS = Number(process.env.SESSION_TTL_DAYS ?? 7)

export interface SessionAccount {
  id: number
  fullName: string
  salutation: string
  email: string
  role: string
}

export async function createSession(
  accountId: number,
): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString('hex')
  const expiresAt = new Date(
    Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000,
  )
  await prisma.session.create({ data: { token, accountId, expiresAt } })
  return { token, expiresAt }
}

export async function getAccountBySessionToken(
  token: string,
): Promise<SessionAccount | null> {
  const session = await prisma.session.findUnique({
    where: { token },
    include: { account: true },
  })
  if (!session || session.expiresAt < new Date()) return null
  return {
    id: session.account.id,
    fullName: session.account.fullName,
    salutation: session.account.salutation,
    email: session.account.email,
    role: session.account.role,
  }
}

export async function deleteSession(token: string): Promise<void> {
  await prisma.session.deleteMany({ where: { token } })
}
