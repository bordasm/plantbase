import { Router } from 'express'
import { requireAccount } from '../middleware/session.js'
import { requireRole } from '../middleware/role.js'
import { listEscalationsForStaff } from '../lib/escalations-store.js'

export const staffEscalationsRouter: Router = Router()

staffEscalationsRouter.get(
  '/api/staff/escalations',
  requireAccount,
  requireRole('staff', 'admin'),
  async (_req, res) => {
    const escalations = await listEscalationsForStaff()
    res.status(200).json({ escalations })
  },
)
