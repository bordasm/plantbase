import { Router } from 'express'
import { requireAccount } from '../middleware/session.js'
import { requireRole } from '../middleware/role.js'
import { computeMetrics } from '../lib/metrics-store.js'

export const staffMetricsRouter: Router = Router()

staffMetricsRouter.get(
  '/api/staff/metrics',
  requireAccount,
  requireRole('staff', 'admin'),
  async (_req, res) => {
    const metrics = await computeMetrics()
    res.status(200).json(metrics)
  },
)
