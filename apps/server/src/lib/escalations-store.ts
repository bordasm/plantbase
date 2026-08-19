import { prisma } from '@plantbase/db'
import type { EscalationActions } from '@plantbase/core'
import { notifyEscalation } from './escalation-emails.js'

export interface EscalationDetail {
  id: number
  accountId: number
  accountName: string
  summary: string
  createdAt: string
}

export function buildEscalationActionsForAccount(
  accountId: number,
): EscalationActions {
  return {
    async escalate(summary: string) {
      const created = await prisma.escalation.create({
        data: { accountId, summary },
      })
      notifyEscalation(created.id, accountId, summary)
      return { escalationId: created.id }
    },
  }
}

export async function listEscalationsForStaff(): Promise<EscalationDetail[]> {
  const escalations = await prisma.escalation.findMany({
    include: { account: true },
    orderBy: { createdAt: 'desc' },
    take: 100,
  })
  return escalations.map((e) => ({
    id: e.id,
    accountId: e.accountId,
    accountName: e.account.fullName,
    summary: e.summary,
    createdAt: e.createdAt.toISOString(),
  }))
}
