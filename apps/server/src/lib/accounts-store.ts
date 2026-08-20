import { randomUUID } from 'node:crypto'
import { prisma } from '@plantbase/db'
import { hashPassword } from '../lib/password.js'

export interface AccountSummary {
  id: number
  fullName: string
  email: string
  role: string
  anonymizedAt: string | null
}

export type AnonymizeResult = 'ok' | 'not_found' | 'already_anonymized'

export async function anonymizeAccount(
  accountId: number,
): Promise<AnonymizeResult> {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.account.findUnique({
      where: { id: accountId },
    })
    if (!existing) return 'not_found'
    if (existing.anonymizedAt) return 'already_anonymized'

    // A hash bemenete egy véletlen, sosem tárolt érték -- a jelszó ezután
    // kriptográfiailag visszafejthetetlen, nem csak egy flag-gel letiltott.
    const passwordHash = await hashPassword(randomUUID())

    await tx.account.update({
      where: { id: accountId },
      data: {
        fullName: `Törölt felhasználó #${accountId}`,
        salutation: 'Ügyfél',
        email: `anonim-${accountId}@plantbase.hu`,
        passwordHash,
        anonymizedAt: new Date(),
      },
    })
    await tx.session.deleteMany({ where: { accountId } })

    return 'ok'
  })
}

export async function listAccountsForStaff(): Promise<AccountSummary[]> {
  const accounts = await prisma.account.findMany({
    orderBy: { id: 'asc' },
    select: {
      id: true,
      fullName: true,
      email: true,
      role: true,
      anonymizedAt: true,
    },
  })
  return accounts.map((a) => ({
    id: a.id,
    fullName: a.fullName,
    email: a.email,
    role: a.role,
    anonymizedAt: a.anonymizedAt ? a.anonymizedAt.toISOString() : null,
  }))
}
