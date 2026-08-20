import { Router } from 'express'
import { requireAccount } from '../middleware/session.js'
import { requireRole } from '../middleware/role.js'
import { anonymizeAccount, listAccountsForStaff } from '../lib/accounts-store.js'

function parseAccountId(raw: unknown): number | null {
  if (typeof raw !== 'string') return null
  const accountId = Number(raw)
  return Number.isInteger(accountId) ? accountId : null
}

export const staffAccountsRouter: Router = Router()

staffAccountsRouter.get(
  '/api/staff/accounts',
  requireAccount,
  requireRole('staff', 'admin'),
  async (_req, res) => {
    const accounts = await listAccountsForStaff()
    res.status(200).json({ accounts })
  },
)

staffAccountsRouter.post(
  '/api/staff/accounts/:id/anonymize',
  requireAccount,
  requireRole('staff', 'admin'),
  async (req, res) => {
    const accountId = parseAccountId(req.params.id)
    if (accountId === null) {
      res.status(400).json({ error: 'Érvénytelen fiók-azonosító.' })
      return
    }
    const result = await anonymizeAccount(accountId)
    if (result === 'not_found') {
      res.status(404).json({ error: 'Nem található ilyen fiók.' })
      return
    }
    if (result === 'already_anonymized') {
      res.status(409).json({ error: 'Ez a fiók már anonimizálva van.' })
      return
    }
    res.status(200).json({ ok: true })
  },
)
